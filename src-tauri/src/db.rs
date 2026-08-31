use crate::models::{FileRecord, IndexStats, SearchFilter};
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
        let mut stmt = self.conn.prepare(
            "SELECT path FROM files WHERE path = ?1 OR path LIKE ?2 COLLATE NOCASE;",
        )?;
        let rows = stmt.query_map(params![normalized, prefix], |r| r.get::<_, String>(0))?;

        let valid_set: std::collections::HashSet<String> = current_valid_paths
            .iter()
            .map(|p| p.to_lowercase())
            .collect();

        let mut to_delete = Vec::new();
        for r in rows {
            if let Ok(p) = r {
                if !valid_set.contains(&p.to_lowercase()) {
                    to_delete.push(p);
                }
            }
        }

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
}
