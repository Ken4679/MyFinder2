use crate::db::Database;
use crate::models::{FileCategory, FileRecord, IndexingStatus};
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;
use walkdir::WalkDir;

pub struct Scanner;

impl Scanner {
    pub fn scan_directory(
        target_dir: &str,
        recursive: bool,
        db_mutex: Arc<Mutex<Database>>,
        status_mutex: Arc<Mutex<IndexingStatus>>,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<u64, String> {
        let start_time = Instant::now();
        let target_path = Path::new(target_dir);

        if !target_path.exists() {
            let err_msg = format!("目录不存在: {}", target_dir);
            if let Ok(mut status) = status_mutex.lock() {
                status.state = "error".to_string();
                status.message = Some(err_msg.clone());
            }
            return Err(err_msg);
        }

        // Initialize status
        if let Ok(mut status) = status_mutex.lock() {
            status.state = "indexing".to_string();
            status.current_directory = Some(target_dir.to_string());
            status.current_file = None;
            status.files_discovered = 0;
            status.files_indexed = 0;
            status.files_skipped = 0;
            status.elapsed_ms = 0;
            status.message = Some(format!("开始扫描目录: {}", target_dir));
        }

        let mut max_depth = usize::MAX;
        if !recursive {
            max_depth = 1;
        }

        let walker = WalkDir::new(target_path)
            .max_depth(max_depth)
            .follow_links(false) // Safe: do NOT follow symlinks/reparse points to avoid recursion
            .into_iter();

        let mut batch: Vec<FileRecord> = Vec::with_capacity(500);
        let mut all_scanned_paths: Vec<String> = Vec::new();
        let mut total_indexed: u64 = 0;
        let mut total_discovered: u64 = 0;
        let mut total_skipped: u64 = 0;

        for entry_res in walker {
            if cancel_token.load(Ordering::Relaxed) {
                // User requested cancellation
                if let Ok(mut status) = status_mutex.lock() {
                    status.state = "cancelled".to_string();
                    status.elapsed_ms = start_time.elapsed().as_millis() as u64;
                    status.message = Some("用户取消了扫描任务".to_string());
                }
                return Ok(total_indexed);
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(err) => {
                    // Safe error handling: Inaccessible directory/file skipped
                    total_skipped += 1;
                    eprintln!("Skipping inaccessible path: {:?}", err);
                    continue;
                }
            };

            let path = entry.path();

            // Skip directories in records, only index files
            if entry.file_type().is_dir() {
                if let Ok(mut status) = status_mutex.lock() {
                    status.current_directory = Some(path.to_string_lossy().to_string());
                }
                continue;
            }

            total_discovered += 1;

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    total_skipped += 1;
                    continue;
                }
            };

            let full_path_str = normalize_path(path);
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let directory = path
                .parent()
                .map(|p| normalize_path(p))
                .unwrap_or_default();

            let extension = path
                .extension()
                .map(|ext| format!(".{}", ext.to_string_lossy().to_lowercase()))
                .unwrap_or_default();

            let size_bytes = metadata.len() as i64;
            let category = FileCategory::from_extension(&extension) as u8;

            let created_time = metadata
                .created()
                .ok()
                .map(|t| {
                    let dt: DateTime<Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            let updated_time = metadata
                .modified()
                .ok()
                .map(|t| {
                    let dt: DateTime<Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            let indexed_time = Utc::now().to_rfc3339();

            let record = FileRecord {
                id: Uuid::new_v4().to_string(),
                path: full_path_str.clone(),
                file_name,
                directory,
                extension,
                size_bytes,
                category,
                created_time,
                updated_time,
                indexed_time,
            };

            batch.push(record);
            all_scanned_paths.push(full_path_str);

            // Flush batch to SQLite in a single transaction every 500 items
            if batch.len() >= 500 {
                if let Ok(mut db) = db_mutex.lock() {
                    let _ = db.upsert_batch(&batch);
                }
                total_indexed += batch.len() as u64;
                batch.clear();

                if let Ok(mut status) = status_mutex.lock() {
                    status.files_discovered = total_discovered;
                    status.files_indexed = total_indexed;
                    status.files_skipped = total_skipped;
                    status.elapsed_ms = start_time.elapsed().as_millis() as u64;
                }
            }
        }

        // Flush remaining records
        if !batch.is_empty() {
            if let Ok(mut db) = db_mutex.lock() {
                let _ = db.upsert_batch(&batch);
            }
            total_indexed += batch.len() as u64;
            batch.clear();
        }

        // Reconcile and prune files that were deleted from disk in this directory
        if let Ok(mut db) = db_mutex.lock() {
            let _ = db.prune_missing_files_in_directory(target_dir, &all_scanned_paths);
            let _ = db.record_directory_scanned(target_dir, total_indexed);
        }

        // Finalize status
        let elapsed = start_time.elapsed().as_millis() as u64;
        if let Ok(mut status) = status_mutex.lock() {
            status.state = "completed".to_string();
            status.files_discovered = total_discovered;
            status.files_indexed = total_indexed;
            status.files_skipped = total_skipped;
            status.elapsed_ms = elapsed;
            status.message = Some(format!(
                "索引构建完成：已索引 {} 个文件，耗时 {} ms",
                total_indexed, elapsed
            ));
        }

        Ok(total_indexed)
    }
}

fn normalize_path(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    // Normalize Windows backslashes
    s.replace('/', "\\")
}
