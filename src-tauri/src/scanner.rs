use crate::db::Database;
use crate::models::{FileCategory, FileRecord, IndexingStatus};
use crate::path_policy::PathPolicy;
use chrono::{DateTime, Utc};
use std::path::Path;
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
            status.files_failed = 0;
            status.elapsed_ms = 0;
            status.message = Some(format!("开始扫描目录: {}", target_dir));
        }

        let mut max_depth = usize::MAX;
        if !recursive {
            max_depth = 1;
        }

        let walker = WalkDir::new(target_path)
            .max_depth(max_depth)
            .follow_links(false) // Safe: do NOT follow symlinks/reparse points to avoid recursion loops
            .into_iter();

        let mut batch: Vec<FileRecord> = Vec::with_capacity(500);
        let mut all_scanned_paths: Vec<String> = Vec::new();
        let mut total_indexed: u64 = 0;
        let mut total_discovered: u64 = 0;
        let mut total_skipped: u64 = 0;
        let mut total_failed: u64 = 0;
        let mut last_error_msg: Option<String> = None;

        for entry_res in walker {
            if cancel_token.load(Ordering::Relaxed) {
                // User requested cancellation - worker safely stops now
                if let Ok(mut status) = status_mutex.lock() {
                    status.state = "cancelled".to_string();
                    status.files_discovered = total_discovered;
                    status.files_indexed = total_indexed;
                    status.files_skipped = total_skipped;
                    status.files_failed = total_failed;
                    status.elapsed_ms = start_time.elapsed().as_millis() as u64;
                    status.message = Some("扫描任务已中止（未执行清理裁剪）".to_string());
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

            let full_path_str = PathPolicy::normalize(path);
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let directory = path
                .parent()
                .map(|p| PathPolicy::normalize(p))
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

            let stable_id = Uuid::new_v5(&Uuid::NAMESPACE_URL, full_path_str.as_bytes()).to_string();

            let record = FileRecord {
                id: stable_id,
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
                let mut write_err = false;
                if let Ok(mut db) = db_mutex.lock() {
                    if let Err(e) = db.upsert_batch(&batch) {
                        total_failed += batch.len() as u64;
                        last_error_msg = Some(format!("数据库批量写入失败: {}", e));
                        write_err = true;
                    }
                }
                if !write_err {
                    total_indexed += batch.len() as u64;
                }
                batch.clear();

                if let Ok(mut status) = status_mutex.lock() {
                    status.files_discovered = total_discovered;
                    status.files_indexed = total_indexed;
                    status.files_skipped = total_skipped;
                    status.files_failed = total_failed;
                    status.elapsed_ms = start_time.elapsed().as_millis() as u64;
                }
            }
        }

        // Flush remaining records
        if !batch.is_empty() {
            let mut write_err = false;
            if let Ok(mut db) = db_mutex.lock() {
                if let Err(e) = db.upsert_batch(&batch) {
                    total_failed += batch.len() as u64;
                    last_error_msg = Some(format!("数据库写入失败: {}", e));
                    write_err = true;
                }
            }
            if !write_err {
                total_indexed += batch.len() as u64;
            }
            batch.clear();
        }

        // Reconcile and prune files that were deleted from disk only if scan was recursive and completed without fatal error
        if total_failed == 0 {
            if recursive {
                if let Ok(mut db) = db_mutex.lock() {
                    let _ = db.prune_missing_files_in_directory(target_dir, &all_scanned_paths);
                    let _ = db.record_directory_scanned(target_dir, total_indexed);
                }
            } else if let Ok(mut db) = db_mutex.lock() {
                let _ = db.record_directory_scanned(target_dir, total_indexed);
            }

            // Establish USN baseline for volume after successful initial scan
            let volume_str = crate::usn_journal::UsnJournal::get_volume_for_path(target_dir);
            if let Ok((journal_id, next_usn, lowest_usn, serial_str, fs_name)) =
                crate::usn_journal::UsnJournal::query_volume_usn_baseline(&volume_str)
            {
                if let Ok(mut db) = db_mutex.lock() {
                    let _ = db.save_volume_usn_state(&crate::models::VolumeUsnState {
                        volume_path: volume_str,
                        volume_serial: serial_str,
                        file_system: fs_name,
                        journal_id,
                        last_usn: next_usn,
                        lowest_valid_usn: lowest_usn,
                        last_sync_time: Utc::now().to_rfc3339(),
                        sync_status: "synced".to_string(),
                        status_message: Some(format!("全量索引完成，锁定 USN 基线: {}", next_usn)),
                    });
                }
            }
        }

        // Finalize status
        let elapsed = start_time.elapsed().as_millis() as u64;
        if let Ok(mut status) = status_mutex.lock() {
            if total_failed > 0 {
                status.state = "error".to_string();
                status.message = Some(format!(
                    "扫描完成但有写入错误：已索引 {} 个，失败 {} 个。错误：{}",
                    total_indexed,
                    total_failed,
                    last_error_msg.unwrap_or_default()
                ));
            } else {
                status.state = "completed".to_string();
                status.message = Some(format!(
                    "索引构建完成：已索引 {} 个文件，耗时 {} ms",
                    total_indexed, elapsed
                ));
            }
            status.files_discovered = total_discovered;
            status.files_indexed = total_indexed;
            status.files_skipped = total_skipped;
            status.files_failed = total_failed;
            status.elapsed_ms = elapsed;
        }

        if total_failed > 0 {
            Err(format!("部分文件未能写入索引数据库 ({} 失败)", total_failed))
        } else {
            Ok(total_indexed)
        }
    }
}
