use crate::models::{FileRecord, IndexStats, SearchFilter, VolumeUsnState};
use chrono::Utc;
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Database {
    conn: Connection,
    db_path: PathBuf,
}

impl Database {
    pub fn new<P: AsRef<Path>>(data_dir: P) -> Result<Self> {
        let dir = data_dir.as_ref();
        let _ = fs::create_dir_all(dir);
        let db_path = dir.join("myfinder.db");

        let conn = Connection::open(&db_path)?;

        // Set SQLite performance & reliability pragmas for local desktop indexing
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -64000;", // 64MB cache
        )?;

        let mut db = Database { conn, db_path };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;

        // Primary files table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                path TEXT UNIQUE NOT NULL COLLATE NOCASE,
                file_name TEXT NOT NULL COLLATE NOCASE,
                directory TEXT NOT NULL COLLATE NOCASE,
                extension TEXT NOT NULL COLLATE NOCASE,
                size_bytes INTEGER NOT NULL,
                category INTEGER NOT NULL,
                created_time TEXT NOT NULL,
                updated_time TEXT NOT NULL,
                indexed_time TEXT NOT NULL
            );",
            [],
        )?;

        // B-Tree Indexes for rapid querying and filtering
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_path ON files (path);",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_name ON files (file_name);",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_directory ON files (directory);",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_extension ON files (extension);",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_category ON files (category);",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_updated ON files (updated_time DESC);",
            [],
        )?;

        // Indexed root directories table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS indexed_directories (
                path TEXT PRIMARY KEY COLLATE NOCASE,
                last_scanned TEXT NOT NULL,
                file_count INTEGER NOT NULL DEFAULT 0
            );",
            [],
        )?;

        // Schema version / metadata table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        )?;

        // NTFS Volume USN Journal state tracking table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS volume_usn_state (
                volume_path TEXT PRIMARY KEY COLLATE NOCASE,
                volume_serial TEXT NOT NULL,
                file_system TEXT NOT NULL,
                journal_id INTEGER NOT NULL,
                last_usn INTEGER NOT NULL,
                lowest_valid_usn INTEGER NOT NULL,
                last_sync_time TEXT NOT NULL,
                sync_status TEXT NOT NULL,
                status_message TEXT
            );",
            [],
        )?;

        // Initialize or verify FTS5 Virtual Table for high-speed full-text search
        let fts_exists: bool = tx
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='files_fts'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if !fts_exists {
            // Attempt to create FTS5 table
            let fts_res = tx.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                    id UNINDEXED,
                    file_name,
                    path,
                    directory,
                    extension,
                    tokenize = 'unicode61'
                );",
                [],
            );

            if fts_res.is_ok() {
                // Set triggers for automatic synchronization
                let _ = tx.execute(
                    "CREATE TRIGGER IF NOT EXISTS trg_files_ai AFTER INSERT ON files BEGIN
                        INSERT INTO files_fts(id, file_name, path, directory, extension)
                        VALUES (new.id, new.file_name, new.path, new.directory, new.extension);
                    END;",
                    [],
                );
                let _ = tx.execute(
                    "CREATE TRIGGER IF NOT EXISTS trg_files_ad AFTER DELETE ON files BEGIN
                        DELETE FROM files_fts WHERE id = old.id;
                    END;",
                    [],
                );
                let _ = tx.execute(
                    "CREATE TRIGGER IF NOT EXISTS trg_files_au AFTER UPDATE ON files BEGIN
                        DELETE FROM files_fts WHERE id = old.id;
                        INSERT INTO files_fts(id, file_name, path, directory, extension)
                        VALUES (new.id, new.file_name, new.path, new.directory, new.extension);
                    END;",
                    [],
                );

                // Backfill existing data if table had records prior to FTS5 creation
                let _ = tx.execute(
                    "INSERT OR IGNORE INTO files_fts(id, file_name, path, directory, extension)
                     SELECT id, file_name, path, directory, extension FROM files;",
                    [],
                );
            }
        } else {
            // Ensure FTS table has all records backfilled
            let _ = tx.execute(
                "INSERT OR IGNORE INTO files_fts(id, file_name, path, directory, extension)
                 SELECT id, file_name, path, directory, extension FROM files
                 WHERE id NOT IN (SELECT id FROM files_fts);",
                [],
            );
        }

        tx.commit()?;
        Ok(())
    }

    pub fn upsert_batch(&mut self, records: &[FileRecord]) -> Result<usize> {
        if records.is_empty() {
            return Ok(0);
        }

        let tx = self.conn.transaction()?;
        let mut count = 0;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO files (id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(path) DO UPDATE SET
                    file_name = excluded.file_name,
                    directory = excluded.directory,
                    extension = excluded.extension,
                    size_bytes = excluded.size_bytes,
                    category = excluded.category,
                    created_time = excluded.created_time,
                    updated_time = excluded.updated_time,
                    indexed_time = excluded.indexed_time;",
            )?;

            for r in records {
                stmt.execute(params![
                    r.id,
                    r.path,
                    r.file_name,
                    r.directory,
                    r.extension,
                    r.size_bytes,
                    r.category,
                    r.created_time,
                    r.updated_time,
                    r.indexed_time,
                ])?;
                count += 1;
            }
        }

        tx.commit()?;
        Ok(count)
    }

    pub fn record_directory_scanned(&mut self, dir_path: &str, file_count: u64) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO indexed_directories (path, last_scanned, file_count)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO UPDATE SET
                last_scanned = excluded.last_scanned,
                file_count = excluded.file_count;",
            params![dir_path, now, file_count as i64],
        )?;
        Ok(())
    }

    pub fn delete_directory_and_files(&mut self, dir_path: &str) -> Result<usize> {
        let normalized = dir_path.trim().trim_end_matches('\\').to_string();
        let prefix = format!("{}\\%", normalized);

        let tx = self.conn.transaction()?;
        let deleted = tx.execute(
            "DELETE FROM files WHERE path = ?1 OR path LIKE ?2 COLLATE NOCASE;",
            params![normalized, prefix],
        )?;
        tx.execute(
            "DELETE FROM indexed_directories WHERE path = ?1 COLLATE NOCASE;",
            params![normalized],
        )?;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn prune_missing_files_in_directory(
        &mut self,
        dir_path: &str,
        current_valid_paths: &[String],
    ) -> Result<usize> {
        let normalized = dir_path.trim().trim_end_matches('\\').to_string();
        let prefix = format!("{}\\%", normalized);

        // Fetch existing recorded paths under this directory
        let to_delete = {
            let mut stmt = self.conn.prepare(
                "SELECT path FROM files WHERE path = ?1 OR path LIKE ?2 COLLATE NOCASE;",
            )?;
            let rows = stmt.query_map(params![normalized, prefix], |r| r.get::<_, String>(0))?;

            let valid_set: std::collections::HashSet<String> = current_valid_paths
                .iter()
                .map(|p| p.to_lowercase())
                .collect();

            let mut list = Vec::new();
            for r in rows {
                if let Ok(p) = r {
                    if !valid_set.contains(&p.to_lowercase()) {
                        list.push(p);
                    }
                }
            }
            list
        };

        if to_delete.is_empty() {
            return Ok(0);
        }

        let tx = self.conn.transaction()?;
        {
            let mut del_stmt = tx.prepare("DELETE FROM files WHERE path = ?1 COLLATE NOCASE;")?;
            for p in &to_delete {
                del_stmt.execute(params![p])?;
            }
        }
        tx.commit()?;

        Ok(to_delete.len())
    }

    pub fn get_file_by_path(&self, file_path: &str) -> Result<Option<FileRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time
             FROM files WHERE path = ?1 COLLATE NOCASE LIMIT 1;",
        )?;

        let mut rows = stmt.query(params![file_path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(FileRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                file_name: row.get(2)?,
                directory: row.get(3)?,
                extension: row.get(4)?,
                size_bytes: row.get(5)?,
                category: row.get(6)?,
                created_time: row.get(7)?,
                updated_time: row.get(8)?,
                indexed_time: row.get(9)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn search_files(&self, filter: SearchFilter) -> Result<Vec<FileRecord>> {
        self.search(&filter)
    }

    pub fn search(&self, filter: &SearchFilter) -> Result<Vec<FileRecord>> {
        let query_trimmed = filter.query.trim();
        let limit = filter.limit.unwrap_or(200).min(500);
        let offset = filter.offset.unwrap_or(0);

        let mut sql = String::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if query_trimmed.is_empty() {
            sql.push_str(
                "SELECT id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time, 0 as relevance
                 FROM files WHERE 1=1"
            );
        } else {
            // High-relevance scoring search: Exact filename > Prefix filename > Substring filename > Extension > Path
            sql.push_str(
                "SELECT id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time,
                 (CASE 
                    WHEN LOWER(file_name) = LOWER(?1) THEN 100
                    WHEN LOWER(file_name) LIKE LOWER(?1) || '%' THEN 80
                    WHEN LOWER(file_name) LIKE '%' || LOWER(?1) || '%' THEN 60
                    WHEN LOWER(extension) = LOWER(?1) OR LOWER(extension) = '.' || LOWER(?1) THEN 40
                    WHEN LOWER(path) LIKE '%' || LOWER(?1) || '%' THEN 20
                    ELSE 10
                  END) as relevance
                 FROM files WHERE 1=1"
            );
            params_vec.push(Box::new(query_trimmed.to_string()));
        }

        // 1. Category Filter
        if let Some(cat) = filter.category {
            sql.push_str(" AND category = ?");
            params_vec.push(Box::new(cat));
        }

        // 2. Date Filters
        if let Some(ref start) = filter.start_date {
            sql.push_str(" AND updated_time >= ?");
            params_vec.push(Box::new(start.clone()));
        }
        if let Some(ref end) = filter.end_date {
            sql.push_str(" AND updated_time <= ?");
            params_vec.push(Box::new(end.clone()));
        }

        // 3. Keyword Match Conditions
        if !query_trimmed.is_empty() {
            let keywords: Vec<&str> = query_trimmed.split_whitespace().collect();
            for kw in keywords {
                let pattern = format!("%{}%", kw);
                if filter.is_deep_search {
                    sql.push_str(" AND (file_name LIKE ? OR path LIKE ? OR directory LIKE ? OR extension LIKE ?)");
                    params_vec.push(Box::new(pattern.clone()));
                    params_vec.push(Box::new(pattern.clone()));
                    params_vec.push(Box::new(pattern.clone()));
                    params_vec.push(Box::new(pattern.clone()));
                } else {
                    sql.push_str(" AND (file_name LIKE ? OR path LIKE ? OR extension LIKE ?)");
                    params_vec.push(Box::new(pattern.clone()));
                    params_vec.push(Box::new(pattern.clone()));
                    params_vec.push(Box::new(pattern.clone()));
                }
            }
        }

        if query_trimmed.is_empty() {
            sql.push_str(" ORDER BY updated_time DESC LIMIT ? OFFSET ?;");
        } else {
            sql.push_str(" ORDER BY relevance DESC, updated_time DESC LIMIT ? OFFSET ?;");
        }
        params_vec.push(Box::new(limit));
        params_vec.push(Box::new(offset));

        let mut stmt = self.conn.prepare(&sql)?;
        let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(params_slice.as_slice(), |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                file_name: row.get(2)?,
                directory: row.get(3)?,
                extension: row.get(4)?,
                size_bytes: row.get(5)?,
                category: row.get(6)?,
                created_time: row.get(7)?,
                updated_time: row.get(8)?,
                indexed_time: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }

        Ok(results)
    }

    pub fn get_all_or_recent(&self, limit: u32, offset: u32) -> Result<Vec<FileRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time
             FROM files ORDER BY updated_time DESC LIMIT ?1 OFFSET ?2;",
        )?;

        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                file_name: row.get(2)?,
                directory: row.get(3)?,
                extension: row.get(4)?,
                size_bytes: row.get(5)?,
                category: row.get(6)?,
                created_time: row.get(7)?,
                updated_time: row.get(8)?,
                indexed_time: row.get(9)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_stats(&self) -> Result<IndexStats> {
        let total_files: i64 = self
            .conn
            .query_row("SELECT count(*) FROM files;", [], |r| r.get(0))
            .unwrap_or(0);

        let total_size_bytes: i64 = self
            .conn
            .query_row("SELECT coalesce(sum(size_bytes), 0) FROM files;", [], |r| r.get(0))
            .unwrap_or(0);

        let last_indexed_time: Option<String> = self
            .conn
            .query_row(
                "SELECT max(indexed_time) FROM files;",
                [],
                |r| r.get(0),
            )
            .ok();

        let db_size_bytes = fs::metadata(&self.db_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        let mut dir_stmt = self.conn.prepare("SELECT path FROM indexed_directories;")?;
        let dir_rows = dir_stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut indexed_directories = Vec::new();
        for d in dir_rows {
            if let Ok(path) = d {
                indexed_directories.push(path);
            }
        }

        Ok(IndexStats {
            total_files: total_files as u64,
            total_size_bytes,
            last_indexed_time,
            db_size_bytes,
            indexed_directories,
        })
    }

    pub fn optimize(&mut self) -> Result<()> {
        self.conn.execute_batch(
            "PRAGMA optimize;
             VACUUM;",
        )?;
        Ok(())
    }

    pub fn wipe(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM files;", [])?;
        tx.execute("DELETE FROM indexed_directories;", [])?;
        let _ = tx.execute("DELETE FROM files_fts;", []);
        tx.commit()?;
        self.optimize()?;
        Ok(())
    }

    pub fn save_volume_usn_state(&mut self, state: &VolumeUsnState) -> Result<()> {
        self.conn.execute(
            "INSERT INTO volume_usn_state (volume_path, volume_serial, file_system, journal_id, last_usn, lowest_valid_usn, last_sync_time, sync_status, status_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(volume_path) DO UPDATE SET
                volume_serial = excluded.volume_serial,
                file_system = excluded.file_system,
                journal_id = excluded.journal_id,
                last_usn = excluded.last_usn,
                lowest_valid_usn = excluded.lowest_valid_usn,
                last_sync_time = excluded.last_sync_time,
                sync_status = excluded.sync_status,
                status_message = excluded.status_message;",
            params![
                state.volume_path,
                state.volume_serial,
                state.file_system,
                state.journal_id as i64,
                state.last_usn,
                state.lowest_valid_usn,
                state.last_sync_time,
                state.sync_status,
                state.status_message,
            ],
        )?;
        Ok(())
    }

    pub fn get_volume_usn_state(&self, volume_path: &str) -> Result<Option<VolumeUsnState>> {
        let mut stmt = self.conn.prepare(
            "SELECT volume_path, volume_serial, file_system, journal_id, last_usn, lowest_valid_usn, last_sync_time, sync_status, status_message
             FROM volume_usn_state WHERE volume_path = ?1 COLLATE NOCASE LIMIT 1;",
        )?;
        let mut rows = stmt.query(params![volume_path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(VolumeUsnState {
                volume_path: row.get(0)?,
                volume_serial: row.get(1)?,
                file_system: row.get(2)?,
                journal_id: row.get::<_, i64>(3)? as u64,
                last_usn: row.get(4)?,
                lowest_valid_usn: row.get(5)?,
                last_sync_time: row.get(6)?,
                sync_status: row.get(7)?,
                status_message: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_volume_usn_states(&self) -> Result<Vec<VolumeUsnState>> {
        let mut stmt = self.conn.prepare(
            "SELECT volume_path, volume_serial, file_system, journal_id, last_usn, lowest_valid_usn, last_sync_time, sync_status, status_message
             FROM volume_usn_state ORDER BY volume_path ASC;",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(VolumeUsnState {
                volume_path: row.get(0)?,
                volume_serial: row.get(1)?,
                file_system: row.get(2)?,
                journal_id: row.get::<_, i64>(3)? as u64,
                last_usn: row.get(4)?,
                lowest_valid_usn: row.get(5)?,
                last_sync_time: row.get(6)?,
                sync_status: row.get(7)?,
                status_message: row.get(8)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn incremental_upsert(&mut self, record: &FileRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO files (id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(path) DO UPDATE SET
                file_name = excluded.file_name,
                directory = excluded.directory,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                category = excluded.category,
                created_time = excluded.created_time,
                updated_time = excluded.updated_time,
                indexed_time = excluded.indexed_time;",
            params![
                record.id,
                record.path,
                record.file_name,
                record.directory,
                record.extension,
                record.size_bytes,
                record.category,
                record.created_time,
                record.updated_time,
                record.indexed_time,
            ],
        )?;
        Ok(())
    }

    pub fn incremental_delete(&mut self, file_path: &str) -> Result<usize> {
        let deleted = self.conn.execute(
            "DELETE FROM files WHERE path = ?1 COLLATE NOCASE;",
            params![file_path],
        )?;
        Ok(deleted)
    }

    pub fn incremental_rename(&mut self, old_path: &str, new_record: &FileRecord) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "DELETE FROM files WHERE path = ?1 COLLATE NOCASE;",
            params![old_path],
        )?;
        tx.execute(
            "INSERT INTO files (id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(path) DO UPDATE SET
                file_name = excluded.file_name,
                directory = excluded.directory,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                category = excluded.category,
                created_time = excluded.created_time,
                updated_time = excluded.updated_time,
                indexed_time = excluded.indexed_time;",
            params![
                new_record.id,
                new_record.path,
                new_record.file_name,
                new_record.directory,
                new_record.extension,
                new_record.size_bytes,
                new_record.category,
                new_record.created_time,
                new_record.updated_time,
                new_record.indexed_time,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn rename_path(&mut self, old_path: &str, new_record: &FileRecord) -> Result<()> {
        let tx = self.conn.transaction()?;
        // 1. Delete old path
        tx.execute("DELETE FROM files WHERE path = ?1 COLLATE NOCASE;", params![old_path])?;
        // 2. Insert new path
        tx.execute(
            "INSERT INTO files (id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(path) DO UPDATE SET
                file_name = excluded.file_name,
                directory = excluded.directory,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                category = excluded.category,
                created_time = excluded.created_time,
                updated_time = excluded.updated_time,
                indexed_time = excluded.indexed_time;",
            params![
                new_record.id,
                new_record.path,
                new_record.file_name,
                new_record.directory,
                new_record.extension,
                new_record.size_bytes,
                new_record.category,
                new_record.created_time,
                new_record.updated_time,
                new_record.indexed_time,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn incremental_apply_batch(
        &mut self,
        creates: &[FileRecord],
        updates: &[FileRecord],
        deletes: &[String],
    ) -> Result<(usize, usize, usize)> {
        if creates.is_empty() && updates.is_empty() && deletes.is_empty() {
            return Ok((0, 0, 0));
        }

        let tx = self.conn.transaction()?;
        let mut creates_count = 0;
        let mut updates_count = 0;
        let mut deletes_count = 0;

        {
            let mut insert_stmt = tx.prepare(
                "INSERT INTO files (id, path, file_name, directory, extension, size_bytes, category, created_time, updated_time, indexed_time)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(path) DO UPDATE SET
                    file_name = excluded.file_name,
                    directory = excluded.directory,
                    extension = excluded.extension,
                    size_bytes = excluded.size_bytes,
                    category = excluded.category,
                    created_time = excluded.created_time,
                    updated_time = excluded.updated_time,
                    indexed_time = excluded.indexed_time;",
            )?;

            for r in creates {
                insert_stmt.execute(params![
                    r.id,
                    r.path,
                    r.file_name,
                    r.directory,
                    r.extension,
                    r.size_bytes,
                    r.category,
                    r.created_time,
                    r.updated_time,
                    r.indexed_time,
                ])?;
                creates_count += 1;
            }

            for r in updates {
                insert_stmt.execute(params![
                    r.id,
                    r.path,
                    r.file_name,
                    r.directory,
                    r.extension,
                    r.size_bytes,
                    r.category,
                    r.created_time,
                    r.updated_time,
                    r.indexed_time,
                ])?;
                updates_count += 1;
            }

            let mut del_stmt = tx.prepare("DELETE FROM files WHERE path = ?1 COLLATE NOCASE;")?;
            for path in deletes {
                let count = del_stmt.execute(params![path])?;
                deletes_count += count;
            }
        }

        tx.commit()?;
        Ok((creates_count, updates_count, deletes_count))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
        .unwrap();

        let mut db = Database {
            conn,
            db_path: PathBuf::from(":memory:"),
        };
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn test_chinese_and_english_search() {
        let mut db = create_test_db();
        let records = vec![
            FileRecord {
                id: "1".to_string(),
                path: r"D:\Documents\2024年第一季度财务预算报告.xlsx".to_string(),
                file_name: "2024年第一季度财务预算报告.xlsx".to_string(),
                directory: r"D:\Documents".to_string(),
                extension: ".xlsx".to_string(),
                size_bytes: 45000,
                category: 1,
                created_time: "2024-01-01T00:00:00Z".to_string(),
                updated_time: "2024-01-15T00:00:00Z".to_string(),
                indexed_time: "2024-01-15T00:00:00Z".to_string(),
            },
            FileRecord {
                id: "2".to_string(),
                path: r"D:\Projects\Rust\MyFinder_architecture.pdf".to_string(),
                file_name: "MyFinder_architecture.pdf".to_string(),
                directory: r"D:\Projects\Rust".to_string(),
                extension: ".pdf".to_string(),
                size_bytes: 120000,
                category: 1,
                created_time: "2024-02-01T00:00:00Z".to_string(),
                updated_time: "2024-02-10T00:00:00Z".to_string(),
                indexed_time: "2024-02-10T00:00:00Z".to_string(),
            },
            FileRecord {
                id: "3".to_string(),
                path: r"D:\Design\用户界面设计规范_v2.sketch".to_string(),
                file_name: "用户界面设计规范_v2.sketch".to_string(),
                directory: r"D:\Design".to_string(),
                extension: ".sketch".to_string(),
                size_bytes: 850000,
                category: 2,
                created_time: "2024-03-01T00:00:00Z".to_string(),
                updated_time: "2024-03-05T00:00:00Z".to_string(),
                indexed_time: "2024-03-05T00:00:00Z".to_string(),
            },
        ];

        db.upsert_batch(&records).unwrap();

        // 1. Chinese substring search: "财务预算"
        let res1 = db
            .search_files(SearchFilter {
                query: "财务预算".to_string(),
                category: None,
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res1.len(), 1);
        assert_eq!(res1[0].id, "1");

        // 2. English keyword search: "MyFinder"
        let res2 = db
            .search_files(SearchFilter {
                query: "MyFinder".to_string(),
                category: None,
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res2.len(), 1);
        assert_eq!(res2[0].id, "2");

        // 3. Category and extension search
        let res3 = db
            .search_files(SearchFilter {
                query: "规范".to_string(),
                category: Some(2),
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res3.len(), 1);
        assert_eq!(res3[0].id, "3");

        // 4. Single-word fragment tests: "预算", "设计", "架构"
        let res_budget = db
            .search_files(SearchFilter {
                query: "预算".to_string(),
                category: None,
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res_budget.len(), 1);
        assert_eq!(res_budget[0].file_name, "2024年第一季度财务预算报告.xlsx");

        let res_design = db
            .search_files(SearchFilter {
                query: "设计".to_string(),
                category: None,
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res_design.len(), 1);
        assert_eq!(res_design[0].file_name, "用户界面设计规范_v2.sketch");

        // 5. Extension search
        let res_ext = db
            .search_files(SearchFilter {
                query: "pdf".to_string(),
                category: None,
                start_date: None,
                end_date: None,
                is_deep_search: false,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(res_ext.len(), 1);
        assert_eq!(res_ext[0].id, "2");
    }

    #[test]
    fn test_fts5_sync_and_prune() {
        let mut db = create_test_db();
        let record = FileRecord {
            id: "100".to_string(),
            path: r"D:\Work\contract_draft.docx".to_string(),
            file_name: "contract_draft.docx".to_string(),
            directory: r"D:\Work".to_string(),
            extension: ".docx".to_string(),
            size_bytes: 2048,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        db.upsert_batch(&[record]).unwrap();

        let count: i64 = db
            .conn
            .query_row("SELECT count(*) FROM files_fts WHERE id = '100';", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);

        // Test pruning missing file
        db.prune_missing_files_in_directory(r"D:\Work", &[]).unwrap();
        let remaining: i64 = db
            .conn
            .query_row("SELECT count(*) FROM files WHERE id = '100';", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(remaining, 0);

        let fts_remaining: i64 = db
            .conn
            .query_row("SELECT count(*) FROM files_fts WHERE id = '100';", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(fts_remaining, 0);
    }

    #[test]
    fn test_incremental_create_delete_and_rename() {
        let mut db = create_test_db();

        // 1. Create file record
        let old_rec = FileRecord {
            id: r"C:\A\old.txt".to_string(),
            path: r"C:\A\old.txt".to_string(),
            file_name: "old.txt".to_string(),
            directory: r"C:\A".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 1024,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        db.incremental_apply_batch(&[old_rec], &[], &[]).unwrap();
        assert_eq!(db.get_stats().unwrap().total_files, 1);

        // 2. Rename old.txt -> new.txt
        let new_rec = FileRecord {
            id: r"C:\B\new.txt".to_string(),
            path: r"C:\B\new.txt".to_string(),
            file_name: "new.txt".to_string(),
            directory: r"C:\B".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 1024,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-02T00:00:00Z".to_string(),
            indexed_time: "2024-01-02T00:00:00Z".to_string(),
        };

        db.rename_path(r"C:\A\old.txt", &new_rec).unwrap();

        // Verify C:\A\old.txt is completely gone and only C:\B\new.txt remains
        let old_exists: i64 = db
            .conn
            .query_row("SELECT count(*) FROM files WHERE path = 'C:\\A\\old.txt';", [], |r| r.get(0))
            .unwrap();
        assert_eq!(old_exists, 0);

        let new_exists: i64 = db
            .conn
            .query_row("SELECT count(*) FROM files WHERE path = 'C:\\B\\new.txt';", [], |r| r.get(0))
            .unwrap();
        assert_eq!(new_exists, 1);

        // 3. Delete file
        db.incremental_apply_batch(&[], &[], &[r"C:\B\new.txt".to_string()]).unwrap();
        assert_eq!(db.get_stats().unwrap().total_files, 0);
    }

    #[test]
    fn test_multiple_rapid_changes() {
        let mut db = create_test_db();

        let mut creates = Vec::new();
        for i in 0..100 {
            creates.push(FileRecord {
                id: format!(r"C:\Temp\log_{}.txt", i),
                path: format!(r"C:\Temp\log_{}.txt", i),
                file_name: format!("log_{}.txt", i),
                directory: r"C:\Temp".to_string(),
                extension: ".txt".to_string(),
                size_bytes: i * 100,
                category: 7,
                created_time: "2024-01-01T00:00:00Z".to_string(),
                updated_time: "2024-01-01T00:00:00Z".to_string(),
                indexed_time: "2024-01-01T00:00:00Z".to_string(),
            });
        }

        // Apply 100 creations
        let (c, u, d) = db.incremental_apply_batch(&creates, &[], &[]).unwrap();
        assert_eq!(c, 100);
        assert_eq!(u, 0);
        assert_eq!(d, 0);
        assert_eq!(db.get_stats().unwrap().total_files, 100);

        // Rapid delete 50 items
        let mut deletes = Vec::new();
        for i in 0..50 {
            deletes.push(format!(r"C:\Temp\log_{}.txt", i));
        }
        let (_, _, d_count) = db.incremental_apply_batch(&[], &[], &deletes).unwrap();
        assert_eq!(d_count, 50);
        assert_eq!(db.get_stats().unwrap().total_files, 50);
    }
}
