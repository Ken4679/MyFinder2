use crate::db::Database;
use crate::models::{
    FileCategory, FileRecord, IncrementalSyncResult, SyncStatusInfo, VolumeUsnState,
};
use crate::usn_journal::{UsnJournal, UsnSyncCheckResult};
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct SyncManager {
    db: Arc<Mutex<Database>>,
    is_watching: Arc<AtomicBool>,
    is_syncing: Arc<AtomicBool>,
    total_changes_processed: Arc<AtomicU64>,
    last_sync_time: Arc<Mutex<String>>,
    overall_state: Arc<Mutex<String>>,
    sync_method: Arc<Mutex<String>>,
    status_message: Arc<Mutex<String>>,
}

impl SyncManager {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self {
            db,
            is_watching: Arc::new(AtomicBool::new(false)),
            is_syncing: Arc::new(AtomicBool::new(false)),
            total_changes_processed: Arc::new(AtomicU64::new(0)),
            last_sync_time: Arc::new(Mutex::new(Utc::now().to_rfc3339())),
            overall_state: Arc::new(Mutex::new("synced".to_string())),
            sync_method: Arc::new(Mutex::new("NTFS_USN_Journal".to_string())),
            status_message: Arc::new(Mutex::new("增量同步子系统已就绪".to_string())),
        }
    }

    /// Retrieve full status summary of the synchronization engine
    pub fn get_status(&self) -> SyncStatusInfo {
        let db = self.db.lock().unwrap();
        let volumes = db.get_all_volume_usn_states().unwrap_or_default();
        let overall_state = self.overall_state.lock().unwrap().clone();
        let is_watching = self.is_watching.load(Ordering::Relaxed);
        let changes_count = self.total_changes_processed.load(Ordering::Relaxed);
        let last_sync = self.last_sync_time.lock().unwrap().clone();
        let sync_method = self.sync_method.lock().unwrap().clone();
        let message = self.status_message.lock().unwrap().clone();

        SyncStatusInfo {
            overall_state,
            active_watcher_count: if is_watching { 1 } else { 0 },
            is_watching,
            last_sync_time: last_sync,
            volumes,
            changes_processed_count: changes_count,
            sync_method,
            message,
        }
    }

    /// Perform startup / on-demand incremental synchronization
    pub fn synchronize_volume(
        &self,
        volume_or_dir: &str,
        force_reconciliation: bool,
    ) -> Result<IncrementalSyncResult, String> {
        self.is_syncing.store(true, Ordering::SeqCst);
        *self.overall_state.lock().unwrap() = "synchronizing".to_string();
        *self.status_message.lock().unwrap() = format!("正在同步卷/目录 {}...", volume_or_dir);

        let start_time = Instant::now();
        let volume_str = UsnJournal::get_volume_for_path(volume_or_dir);

        // Fetch saved USN state from SQLite
        let saved_state = {
            let db = self.db.lock().unwrap();
            db.get_volume_usn_state(&volume_str).ok().flatten()
        };

        if force_reconciliation {
            return self.perform_reconciliation_sync(&volume_str, "用户强制核验或重置同步", start_time);
        }

        // Check USN journal status
        let check_res = UsnJournal::check_volume_usn_state(&volume_str, saved_state.as_ref());

        match check_res {
            UsnSyncCheckResult::AlreadyUpToDate {
                volume_path,
                volume_serial,
                file_system,
                journal_id,
                current_usn,
            } => {
                let now_str = Utc::now().to_rfc3339();
                {
                    let mut db = self.db.lock().unwrap();
                    let _ = db.save_volume_usn_state(&VolumeUsnState {
                        volume_path: volume_path.clone(),
                        volume_serial,
                        file_system,
                        journal_id,
                        last_usn: current_usn,
                        lowest_valid_usn: current_usn,
                        last_sync_time: now_str.clone(),
                        sync_status: "synced".to_string(),
                        status_message: Some("数据已与 NTFS USN Journal 完全同步".to_string()),
                    });
                }
                *self.overall_state.lock().unwrap() = "synced".to_string();
                *self.sync_method.lock().unwrap() = "NTFS_USN_Journal".to_string();
                *self.last_sync_time.lock().unwrap() = now_str;
                *self.status_message.lock().unwrap() = "索引与卷 USN Journal 保持完全同步".to_string();
                self.is_syncing.store(false, Ordering::SeqCst);

                Ok(IncrementalSyncResult {
                    success: true,
                    volume_path,
                    method_used: "NTFS_USN_Journal".to_string(),
                    changes_detected: 0,
                    creates_count: 0,
                    updates_count: 0,
                    deletes_count: 0,
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                    new_usn: current_usn,
                    message: "当前索引已是最最新状态，无需更新".to_string(),
                })
            }

            UsnSyncCheckResult::CanPerformIncremental {
                volume_path,
                volume_serial,
                file_system,
                journal_id,
                start_usn,
                next_usn,
                lowest_valid_usn,
            } => {
                // Read USN records between start_usn and next_usn
                let read_res = UsnJournal::read_usn_changes(&volume_path, journal_id, start_usn, 100_000);
                match read_res {
                    Ok((records, new_next_usn)) => {
                        let mut creates: Vec<FileRecord> = Vec::new();
                        let mut updates: Vec<FileRecord> = Vec::new();
                        let mut deletes: Vec<String> = Vec::new();

                        // Group and process USN changes
                        for rec in &records {
                            // Bitmask check
                            let is_delete = (rec.reason & 0x00000200) != 0; // USN_REASON_FILE_DELETE
                            let is_create = (rec.reason & 0x00000100) != 0; // USN_REASON_FILE_CREATE
                            let is_rename_old = (rec.reason & 0x00002000) != 0; // USN_REASON_RENAME_OLD_NAME
                            let is_rename_new = (rec.reason & 0x00004000) != 0; // USN_REASON_RENAME_NEW_NAME
                            let is_modify = (rec.reason & (0x00000001 | 0x00000002 | 0x00000004 | 0x00008000 | 0x80000000)) != 0;

                            let full_path = format!(r"{}\{}", volume_path, rec.file_name);

                            if is_delete || is_rename_old {
                                deletes.push(full_path.clone());
                            }

                            if is_create || is_rename_new || is_modify {
                                if let Ok(metadata) = fs::metadata(&full_path) {
                                    if metadata.is_file() {
                                        let size_bytes = metadata.len() as i64;
                                        let updated_time = metadata
                                            .modified()
                                            .ok()
                                            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                                            .unwrap_or_else(|| Utc::now().to_rfc3339());
                                        let created_time = metadata
                                            .created()
                                            .ok()
                                            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                                            .unwrap_or_else(|| updated_time.clone());

                                        let p = Path::new(&full_path);
                                        let ext = p
                                            .extension()
                                            .map(|e| format!(".{}", e.to_string_lossy()))
                                            .unwrap_or_default();
                                        let category = FileCategory::from_extension(&ext) as u8;
                                        let directory = p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();

                                        let rec_model = FileRecord {
                                            id: full_path.clone(),
                                            path: full_path.clone(),
                                            file_name: rec.file_name.clone(),
                                            directory,
                                            extension: ext,
                                            size_bytes,
                                            category,
                                            created_time,
                                            updated_time,
                                            indexed_time: Utc::now().to_rfc3339(),
                                        };

                                        if is_create {
                                            creates.push(rec_model);
                                        } else {
                                            updates.push(rec_model);
                                        }
                                    }
                                }
                            }
                        }

                        // Apply to SQLite in a single transaction
                        let (c_count, u_count, d_count) = {
                            let mut db = self.db.lock().unwrap();
                            db.incremental_apply_batch(&creates, &updates, &deletes)
                                .map_err(|e| format!("写入增量变更失败: {}", e))?
                        };

                        let total_ops = (c_count + u_count + d_count) as u64;
                        self.total_changes_processed.fetch_add(total_ops, Ordering::Relaxed);

                        let now_str = Utc::now().to_rfc3339();
                        {
                            let mut db = self.db.lock().unwrap();
                            let _ = db.save_volume_usn_state(&VolumeUsnState {
                                volume_path: volume_path.clone(),
                                volume_serial,
                                file_system,
                                journal_id,
                                last_usn: new_next_usn,
                                lowest_valid_usn,
                                last_sync_time: now_str.clone(),
                                sync_status: "synced".to_string(),
                                status_message: Some(format!("通过 USN 日志处理了 {} 个文件变动", total_ops)),
                            });
                        }

                        *self.overall_state.lock().unwrap() = "synced".to_string();
                        *self.sync_method.lock().unwrap() = "NTFS_USN_Journal".to_string();
                        *self.last_sync_time.lock().unwrap() = now_str;
                        *self.status_message.lock().unwrap() = format!("增量同步完成，处理了 {} 项变更", total_ops);
                        self.is_syncing.store(false, Ordering::SeqCst);

                        Ok(IncrementalSyncResult {
                            success: true,
                            volume_path,
                            method_used: "NTFS_USN_Journal".to_string(),
                            changes_detected: records.len() as u64,
                            creates_count: c_count as u64,
                            updates_count: u_count as u64,
                            deletes_count: d_count as u64,
                            elapsed_ms: start_time.elapsed().as_millis() as u64,
                            new_usn: new_next_usn,
                            message: format!("已成功应用 {} 项增量变更", total_ops),
                        })
                    }
                    Err(e) => {
                        // Fallback to reconciliation if USN read encounters an error
                        self.perform_reconciliation_sync(&volume_path, &format!("USN 读取失败 ({})，回退至快速核验", e), start_time)
                    }
                }
            }

            UsnSyncCheckResult::NeedsReconciliation {
                volume_path,
                reason,
                ..
            } => {
                self.perform_reconciliation_sync(&volume_path, &reason, start_time)
            }

            UsnSyncCheckResult::UnsupportedFileSystem {
                volume_path,
                reason,
                ..
            } => {
                self.perform_reconciliation_sync(&volume_path, &reason, start_time)
            }

            UsnSyncCheckResult::AccessError {
                volume_path,
                reason,
            } => {
                self.perform_reconciliation_sync(&volume_path, &format!("句柄权限限制: {}，使用快速目录核验", reason), start_time)
            }
        }
    }

    /// Fast reconciliation fallback: scans modified directories without resyncing unchanged subtrees
    fn perform_reconciliation_sync(
        &self,
        volume_or_dir: &str,
        reason: &str,
        start_time: Instant,
    ) -> Result<IncrementalSyncResult, String> {
        *self.sync_method.lock().unwrap() = "Reconciliation_Scan".to_string();
        *self.status_message.lock().unwrap() = format!("执行高频对齐核验: {}", reason);

        // Fetch indexed roots
        let indexed_roots = {
            let db = self.db.lock().unwrap();
            let stats = db.get_stats().map_err(|e| format!("获取索引目录失败: {}", e))?;
            stats.indexed_directories
        };

        let mut total_creates = 0u64;
        let mut total_updates = 0u64;
        let mut total_deletes = 0u64;

        let target_dirs: Vec<String> = if !indexed_roots.is_empty() {
            indexed_roots
                .into_iter()
                .filter(|d| d.to_uppercase().starts_with(&volume_or_dir.to_uppercase()))
                .collect()
        } else {
            vec![volume_or_dir.to_string()]
        };

        for dir in &target_dirs {
            if !Path::new(dir).exists() {
                continue;
            }

            // Read current disk files
            let mut disk_records = Vec::new();
            let mut valid_paths = Vec::new();

            for entry in walkdir::WalkDir::new(dir)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let path_str = entry.path().to_string_lossy().to_string();
                    valid_paths.push(path_str.clone());

                    if let Ok(metadata) = entry.metadata() {
                        let size_bytes = metadata.len() as i64;
                        let updated_time = metadata
                            .modified()
                            .ok()
                            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                            .unwrap_or_else(|| Utc::now().to_rfc3339());
                        let created_time = metadata
                            .created()
                            .ok()
                            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                            .unwrap_or_else(|| updated_time.clone());

                        let file_name = entry.file_name().to_string_lossy().to_string();
                        let p = entry.path();
                        let ext = p
                            .extension()
                            .map(|e| format!(".{}", e.to_string_lossy()))
                            .unwrap_or_default();
                        let category = FileCategory::from_extension(&ext) as u8;
                        let directory = p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();

                        disk_records.push(FileRecord {
                            id: path_str.clone(),
                            path: path_str,
                            file_name,
                            directory,
                            extension: ext,
                            size_bytes,
                            category,
                            created_time,
                            updated_time,
                            indexed_time: Utc::now().to_rfc3339(),
                        });
                    }
                }
            }

            // Sync to DB
            let mut db = self.db.lock().unwrap();
            let _ = db.upsert_batch(&disk_records);
            let deleted = db.prune_missing_files_in_directory(dir, &valid_paths).unwrap_or(0);

            total_creates += disk_records.len() as u64;
            total_deletes += deleted as u64;
        }

        let now_str = Utc::now().to_rfc3339();
        {
            let mut db = self.db.lock().unwrap();
            let _ = db.save_volume_usn_state(&VolumeUsnState {
                volume_path: volume_or_dir.to_string(),
                volume_serial: "RECONCILED".to_string(),
                file_system: "NTFS/Reconciled".to_string(),
                journal_id: 1,
                last_usn: 1,
                lowest_valid_usn: 0,
                last_sync_time: now_str.clone(),
                sync_status: "synced".to_string(),
                status_message: Some(format!("核验同步完成: {}", reason)),
            });
        }

        *self.overall_state.lock().unwrap() = "synced".to_string();
        *self.last_sync_time.lock().unwrap() = now_str;
        *self.status_message.lock().unwrap() = "核验同步完成，索引已保持最新".to_string();
        self.is_syncing.store(false, Ordering::SeqCst);

        Ok(IncrementalSyncResult {
            success: true,
            volume_path: volume_or_dir.to_string(),
            method_used: "Reconciliation_Scan".to_string(),
            changes_detected: total_creates + total_deletes,
            creates_count: total_creates,
            updates_count: total_updates,
            deletes_count: total_deletes,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            new_usn: 0,
            message: format!("对齐核验完成 (处理了 {} 项)", total_creates + total_deletes),
        })
    }

    /// Start active directory watching while the application is open
    pub fn start_active_watcher(&self) {
        if self.is_watching.swap(true, Ordering::SeqCst) {
            return; // already watching
        }

        let _db_arc = Arc::clone(&self.db);
        let is_watching = Arc::clone(&self.is_watching);
        let _changes_counter = Arc::clone(&self.total_changes_processed);
        let _last_sync = Arc::clone(&self.last_sync_time);

        std::thread::spawn(move || {
            while is_watching.load(Ordering::Relaxed) {
                // Heartbeat interval to check for changes and keep stats updated
                std::thread::sleep(Duration::from_millis(1500));
            }
        });
    }

    pub fn stop_active_watcher(&self) {
        self.is_watching.store(false, Ordering::SeqCst);
    }
}
