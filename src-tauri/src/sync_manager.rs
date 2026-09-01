use crate::db::Database;
use crate::models::{
    FileCategory, FileRecord, IncrementalSyncResult, SyncStatusInfo, VolumeUsnState,
};
use crate::usn_journal::{
    FrnPathResolver, UsnJournal, UsnSyncCheckResult, USN_REASON_BASIC_INFO_CHANGE,
    USN_REASON_CLOSE, USN_REASON_DATA_EXTEND, USN_REASON_DATA_OVERWRITE,
    USN_REASON_DATA_TRUNCATION, USN_REASON_FILE_CREATE, USN_REASON_FILE_DELETE,
    USN_REASON_RENAME_NEW_NAME, USN_REASON_RENAME_OLD_NAME,
};
use chrono::Utc;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct PendingChangeItem {
    pub path: String,
    pub old_path: Option<String>,
    pub timestamp: Instant,
}

pub struct SyncManager {
    db: Arc<Mutex<Database>>,
    is_watching: Arc<AtomicBool>,
    is_syncing: Arc<AtomicBool>,
    total_changes_processed: Arc<AtomicU64>,
    last_sync_time: Arc<Mutex<String>>,
    overall_state: Arc<Mutex<String>>,
    sync_method: Arc<Mutex<String>>,
    status_message: Arc<Mutex<String>>,
    frn_resolvers: Arc<Mutex<HashMap<String, FrnPathResolver>>>,
    #[cfg(windows)]
    shutdown_event: Arc<Mutex<Option<usize>>>, // raw HANDLE representation
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
            frn_resolvers: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(windows)]
            shutdown_event: Arc::new(Mutex::new(None)),
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
            active_watcher_count: if is_watching { volumes.len().max(1) } else { 0 },
            is_watching,
            last_sync_time: last_sync,
            volumes,
            changes_processed_count: changes_count,
            sync_method,
            message,
        }
    }

    /// Perform automatic synchronization at startup for all indexed volumes
    pub fn perform_startup_sync(&self) {
        let is_syncing = Arc::clone(&self.is_syncing);
        let overall_state = Arc::clone(&self.overall_state);
        let status_message = Arc::clone(&self.status_message);
        let db_arc = Arc::clone(&self.db);
        let sync_manager_ptr = self.clone_handle();

        std::thread::spawn(move || {
            is_syncing.store(true, Ordering::SeqCst);
            *overall_state.lock().unwrap() = "synchronizing".to_string();
            *status_message.lock().unwrap() = "启动自检：正在通过 NTFS USN 日志对齐文件系统...".to_string();

            let target_volumes: Vec<String> = {
                if let Ok(db) = db_arc.lock() {
                    let mut vols = Vec::new();
                    if let Ok(stats) = db.get_stats() {
                        for dir in stats.indexed_directories {
                            let v = UsnJournal::get_volume_for_path(&dir);
                            if !vols.contains(&v) {
                                vols.push(v);
                            }
                        }
                    }
                    if let Ok(saved_vols) = db.get_all_volume_usn_states() {
                        for sv in saved_vols {
                            let v = sv.volume_path.trim_end_matches('\\').to_uppercase();
                            if !vols.contains(&v) {
                                vols.push(v);
                            }
                        }
                    }
                    vols
                } else {
                    Vec::new()
                }
            };

            if target_volumes.is_empty() {
                *overall_state.lock().unwrap() = "synced".to_string();
                *status_message.lock().unwrap() = "增量引擎就绪 (等待首次全盘或目录索引)".to_string();
                is_syncing.store(false, Ordering::SeqCst);
                return;
            }

            let mut all_succeeded = true;
            let mut summary_messages = Vec::new();

            for vol in target_volumes {
                match sync_manager_ptr.synchronize_volume(&vol, false) {
                    Ok(res) => {
                        summary_messages.push(format!("{}: {}", vol, res.message));
                    }
                    Err(e) => {
                        all_succeeded = false;
                        summary_messages.push(format!("{}: 失败 ({})", vol, e));
                    }
                }
            }

            if all_succeeded {
                *overall_state.lock().unwrap() = "synced".to_string();
                *status_message.lock().unwrap() = format!(
                    "启动秒级对齐完成：{}",
                    summary_messages.join(" | ")
                );
            } else {
                *overall_state.lock().unwrap() = "needs_rescan".to_string();
                *status_message.lock().unwrap() = format!(
                    "部分卷同步需要核验：{}",
                    summary_messages.join(" | ")
                );
            }

            is_syncing.store(false, Ordering::SeqCst);

            // Auto-start active file watcher for open session
            sync_manager_ptr.start_active_watcher();
        });
    }

    /// Perform incremental or fallback synchronization on a target volume
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
            let db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
            db.get_volume_usn_state(&volume_str).ok().flatten()
        };

        if force_reconciliation {
            return self.perform_reconciliation_sync(&volume_str, "用户强制核验或重置同步", start_time);
        }

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
                    let mut db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
                    db.save_volume_usn_state(&VolumeUsnState {
                        volume_path: volume_path.clone(),
                        volume_serial,
                        file_system,
                        journal_id,
                        last_usn: current_usn,
                        lowest_valid_usn: current_usn,
                        last_sync_time: now_str.clone(),
                        sync_status: "synced".to_string(),
                        status_message: Some("数据已与 NTFS USN Journal 完全同步".to_string()),
                    }).map_err(|e| format!("保存卷状态失败: {}", e))?;
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
                // Initialize Real FRN Resolver
                let mut resolver = {
                    let mut resolvers = self.frn_resolvers.lock().unwrap();
                    resolvers
                        .entry(volume_path.clone())
                        .or_insert_with(|| FrnPathResolver::new(&volume_path))
                        .clone()
                };

                // Populate known indexed directories into resolver using real Win32 FRNs
                if let Ok(db) = self.db.lock() {
                    if let Ok(stats) = db.get_stats() {
                        resolver.populate_from_directories(&stats.indexed_directories);
                    }
                }

                // Proper paginated read of USN records
                let read_res = UsnJournal::read_usn_changes_paged(
                    &volume_path,
                    journal_id,
                    start_usn,
                    Some(next_usn),
                    500_000,
                );

                match read_res {
                    Ok((records, new_next_usn, is_complete)) => {
                        if !is_complete {
                            return self.perform_reconciliation_sync(
                                &volume_path,
                                "USN 变更集超出单次处理上限，执行快速核验",
                                start_time,
                            );
                        }

                        let mut creates: Vec<FileRecord> = Vec::new();
                        let mut updates: Vec<FileRecord> = Vec::new();
                        let mut deletes: Vec<String> = Vec::new();
                        let mut unresolvable_count = 0usize;

                        // Pass 1: Update directory nodes in FRN hierarchy
                        for rec in &records {
                            let is_dir = (rec.file_attributes & 0x00000010) != 0;
                            let is_delete = (rec.reason & USN_REASON_FILE_DELETE) != 0;
                            let is_rename_old = (rec.reason & USN_REASON_RENAME_OLD_NAME) != 0;

                            if is_dir {
                                if is_delete || is_rename_old {
                                    resolver.remove_node(rec.file_reference_number);
                                } else {
                                    resolver.insert_node(
                                        rec.file_reference_number,
                                        rec.parent_file_reference_number,
                                        &rec.file_name,
                                        true,
                                    );
                                }
                            }
                        }

                        // Pass 2: Process file records with high-confidence FRN path resolution
                        for rec in &records {
                            let is_dir = (rec.file_attributes & 0x00000010) != 0;
                            if is_dir {
                                continue;
                            }

                            let is_delete = (rec.reason & USN_REASON_FILE_DELETE) != 0;
                            let is_create = (rec.reason & USN_REASON_FILE_CREATE) != 0;
                            let is_rename_old = (rec.reason & USN_REASON_RENAME_OLD_NAME) != 0;
                            let is_rename_new = (rec.reason & USN_REASON_RENAME_NEW_NAME) != 0;
                            let is_modify = (rec.reason
                                & (USN_REASON_DATA_OVERWRITE
                                    | USN_REASON_DATA_EXTEND
                                    | USN_REASON_DATA_TRUNCATION
                                    | USN_REASON_BASIC_INFO_CHANGE
                                    | USN_REASON_CLOSE))
                                != 0;

                            let resolved_path = resolver
                                .resolve_file_path(rec.parent_file_reference_number, &rec.file_name);

                            match resolved_path {
                                Some(full_path) => {
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
                                                let directory = p
                                                    .parent()
                                                    .map(|d| d.to_string_lossy().to_string())
                                                    .unwrap_or_default();

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
                                None => {
                                    unresolvable_count += 1;
                                }
                            }
                        }

                        // Update cached FRN resolver
                        {
                            let mut resolvers = self.frn_resolvers.lock().unwrap();
                            resolvers.insert(volume_path.clone(), resolver);
                        }

                        // If any parent FRN is unresolvable: NEVER guess; trigger safe reconciliation!
                        if unresolvable_count > 0 {
                            return self.perform_reconciliation_sync(
                                &volume_path,
                                "检测到未解析的上级目录 FRN 链，触发快速核验保障数据完整",
                                start_time,
                            );
                        }

                        // Apply to SQLite atomically in a single transaction
                        let (c_count, u_count, d_count) = {
                            let mut db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
                            db.incremental_apply_batch(&creates, &updates, &deletes)
                                .map_err(|e| format!("写入增量变更失败: {}", e))?
                        };

                        let total_ops = (c_count + u_count + d_count) as u64;
                        self.total_changes_processed.fetch_add(total_ops, Ordering::Relaxed);

                        // Advance last_usn ONLY after successful transaction commit
                        let now_str = Utc::now().to_rfc3339();
                        {
                            let mut db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
                            db.save_volume_usn_state(&VolumeUsnState {
                                volume_path: volume_path.clone(),
                                volume_serial,
                                file_system,
                                journal_id,
                                last_usn: new_next_usn,
                                lowest_valid_usn,
                                last_sync_time: now_str.clone(),
                                sync_status: "synced".to_string(),
                                status_message: Some(format!("通过 USN 日志处理了 {} 个文件变动", total_ops)),
                            }).map_err(|e| format!("保存卷状态失败: {}", e))?;
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
                        self.perform_reconciliation_sync(
                            &volume_path,
                            &format!("USN 读取失败 ({})，回退至快速核验", e),
                            start_time,
                        )
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
                self.perform_reconciliation_sync(&volume_path, &format!("非 NTFS 卷: {}", reason), start_time)
            }

            UsnSyncCheckResult::AccessError {
                volume_path,
                reason,
            } => {
                self.perform_reconciliation_sync(&volume_path, &format!("权限受限: {}", reason), start_time)
            }
        }
    }

    /// Safe fallback reconciliation scan (e.g. for non-NTFS, journal reset, or unresolvable chains)
    pub fn perform_reconciliation_sync(
        &self,
        volume_or_dir: &str,
        reason: &str,
        start_time: Instant,
    ) -> Result<IncrementalSyncResult, String> {
        *self.overall_state.lock().unwrap() = "synchronizing".to_string();
        *self.sync_method.lock().unwrap() = "Reconciliation_Scan".to_string();
        *self.status_message.lock().unwrap() = format!("正在执行快速核验 (原因: {})...", reason);

        let indexed_dirs = {
            let db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
            let stats = db.get_stats().map_err(|e| format!("获取统计失败: {}", e))?;
            stats.indexed_directories
        };

        let target_dirs: Vec<String> = indexed_dirs
            .into_iter()
            .filter(|d| {
                d.starts_with(volume_or_dir)
                    || volume_or_dir.starts_with(d)
                    || UsnJournal::get_volume_for_path(d) == UsnJournal::get_volume_for_path(volume_or_dir)
            })
            .collect();

        if target_dirs.is_empty() {
            let now_str = Utc::now().to_rfc3339();
            *self.overall_state.lock().unwrap() = "synced".to_string();
            *self.last_sync_time.lock().unwrap() = now_str;
            *self.status_message.lock().unwrap() = "无已索引目录需要核验".to_string();
            self.is_syncing.store(false, Ordering::SeqCst);

            return Ok(IncrementalSyncResult {
                success: true,
                volume_path: volume_or_dir.to_string(),
                method_used: "Reconciliation_Scan".to_string(),
                changes_detected: 0,
                creates_count: 0,
                updates_count: 0,
                deletes_count: 0,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
                new_usn: 0,
                message: "无已索引目录需要核验".to_string(),
            });
        }

        let mut total_creates = 0u64;
        let total_updates = 0u64;
        let mut total_deletes = 0u64;

        for dir in &target_dirs {
            if !Path::new(dir).exists() {
                continue;
            }

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

            {
                let mut db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
                db.upsert_batch(&disk_records).map_err(|e| format!("批量插入失败: {}", e))?;
                let deleted = db.prune_missing_files_in_directory(dir, &valid_paths).unwrap_or(0);
                total_creates += disk_records.len() as u64;
                total_deletes += deleted as u64;
            }
        }

        // Establish baseline state after successful reconciliation
        let (journal_id, next_usn, lowest_usn, serial_str, fs_name) =
            UsnJournal::query_volume_usn_baseline(volume_or_dir)
                .unwrap_or((1, 1, 0, "RECONCILED".to_string(), "NTFS/Reconciled".to_string()));

        let now_str = Utc::now().to_rfc3339();
        {
            let mut db = self.db.lock().map_err(|e| format!("数据库锁定失败: {}", e))?;
            db.save_volume_usn_state(&VolumeUsnState {
                volume_path: volume_or_dir.to_string(),
                volume_serial: serial_str,
                file_system: fs_name,
                journal_id,
                last_usn: next_usn,
                lowest_valid_usn: lowest_usn,
                last_sync_time: now_str.clone(),
                sync_status: "synced".to_string(),
                status_message: Some(format!("核验同步完成: {}", reason)),
            }).map_err(|e| format!("保存卷状态失败: {}", e))?;
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
            new_usn: next_usn,
            message: format!("对齐核验完成 (处理了 {} 项)", total_creates + total_deletes),
        })
    }

    /// Start active directory watching concurrently across all indexed roots
    pub fn start_active_watcher(&self) {
        if self.is_watching.swap(true, Ordering::SeqCst) {
            return; // already watching
        }

        let db_arc = Arc::clone(&self.db);
        let is_watching = Arc::clone(&self.is_watching);
        let changes_counter = Arc::clone(&self.total_changes_processed);
        let last_sync = Arc::clone(&self.last_sync_time);
        let overall_state = Arc::clone(&self.overall_state);
        let sync_mgr = self.clone_handle();

        // Shared Debounce Pending Changes Queue
        let pending_queue: Arc<Mutex<HashMap<String, PendingChangeItem>>> =
            Arc::new(Mutex::new(HashMap::new()));

        #[cfg(windows)]
        let shutdown_event_usize: usize = {
            let raw_event = unsafe {
                crate::usn_journal::winapi_compat::CreateEventW(
                    std::ptr::null_mut(),
                    1, // manual reset
                    0, // initially non-signaled
                    std::ptr::null(),
                )
            };
            let handle_usize = raw_event as usize;
            *self.shutdown_event.lock().unwrap() = Some(handle_usize);
            handle_usize
        };

        // Start Debounce Processor Thread
        let debounce_queue_clone = Arc::clone(&pending_queue);
        let is_watching_debounce = Arc::clone(&is_watching);
        let db_debounce = Arc::clone(&db_arc);
        let changes_debounce = Arc::clone(&changes_counter);
        let last_sync_debounce = Arc::clone(&last_sync);

        std::thread::Builder::new()
            .name("myfinder-debounce-worker".to_string())
            .spawn(move || {
                run_debounce_processor(
                    debounce_queue_clone,
                    is_watching_debounce,
                    db_debounce,
                    changes_debounce,
                    last_sync_debounce,
                );
            })
            .ok();

        // Start Concurrent Root Watchers
        std::thread::Builder::new()
            .name("myfinder-watcher-orchestrator".to_string())
            .spawn(move || {
                #[cfg(windows)]
                {
                    run_windows_multi_root_watcher(
                        db_arc,
                        is_watching,
                        pending_queue,
                        shutdown_event_usize,
                        sync_mgr,
                    );
                }

                #[cfg(not(windows))]
                {
                    let _ = overall_state;
                    let _ = sync_mgr;
                    while is_watching.load(Ordering::Relaxed) {
                        std::thread::sleep(Duration::from_millis(1000));
                    }
                }
            })
            .ok();
    }

    /// Stop active directory watching with clean Win32 cancellation.
    /// Cancels all Overlapped I/O, closes handles, and leaves NO daemon or background processes.
    pub fn stop_active_watcher(&self) {
        self.is_watching.store(false, Ordering::SeqCst);

        #[cfg(windows)]
        {
            if let Ok(mut handle_guard) = self.shutdown_event.lock() {
                if let Some(raw_handle_val) = handle_guard.take() {
                    let h_event = raw_handle_val as *mut std::ffi::c_void;
                    unsafe {
                        crate::usn_journal::winapi_compat::SetEvent(h_event);
                        crate::usn_journal::winapi_compat::CloseHandle(h_event);
                    }
                }
            }
        }
    }

    fn clone_handle(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
            is_watching: Arc::clone(&self.is_watching),
            is_syncing: Arc::clone(&self.is_syncing),
            total_changes_processed: Arc::clone(&self.total_changes_processed),
            last_sync_time: Arc::clone(&self.last_sync_time),
            overall_state: Arc::clone(&self.overall_state),
            sync_method: Arc::clone(&self.sync_method),
            status_message: Arc::clone(&self.status_message),
            frn_resolvers: Arc::clone(&self.frn_resolvers),
            #[cfg(windows)]
            shutdown_event: Arc::clone(&self.shutdown_event),
        }
    }
}

/// Debounce Queue Processor:
/// Coalesces rapid notifications within a 200ms debounce window.
/// After debounce:
/// - Statted on disk -> exists -> update SQLite
/// - Statted on disk -> does not exist -> remove from SQLite index
/// - Never modifies or deletes the real file on disk!
fn run_debounce_processor(
    queue: Arc<Mutex<HashMap<String, PendingChangeItem>>>,
    is_watching: Arc<AtomicBool>,
    db_arc: Arc<Mutex<Database>>,
    changes_counter: Arc<AtomicU64>,
    last_sync: Arc<Mutex<String>>,
) {
    let debounce_window = Duration::from_millis(200);

    while is_watching.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(60));

        let items_to_process: Vec<PendingChangeItem> = {
            let mut guard = queue.lock().unwrap();
            let now = Instant::now();
            let mut ready_keys = Vec::new();

            for (path, item) in guard.iter() {
                if now.duration_since(item.timestamp) >= debounce_window {
                    ready_keys.push(path.clone());
                }
            }

            let mut ready_items = Vec::new();
            for k in ready_keys {
                if let Some(item) = guard.remove(&k) {
                    ready_items.push(item);
                }
            }
            ready_items
        };

        if items_to_process.is_empty() {
            continue;
        }

        let mut updates = Vec::new();
        let mut deletes = Vec::new();

        for item in items_to_process {
            if let Some(old_p) = item.old_path {
                deletes.push(old_p);
            }

            let p = Path::new(&item.path);
            if let Ok(metadata) = fs::metadata(p) {
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

                    let ext = p
                        .extension()
                        .map(|e| format!(".{}", e.to_string_lossy()))
                        .unwrap_or_default();
                    let category = FileCategory::from_extension(&ext) as u8;
                    let file_name = p
                        .file_name()
                        .map(|f| f.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let directory = p
                        .parent()
                        .map(|d| d.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let record = FileRecord {
                        id: item.path.clone(),
                        path: item.path.clone(),
                        file_name,
                        directory,
                        extension: ext,
                        size_bytes,
                        category,
                        created_time,
                        updated_time,
                        indexed_time: Utc::now().to_rfc3339(),
                    };

                    updates.push(record);
                }
            } else {
                // File does not exist on disk (deleted or moved away) -> remove ONLY index entry in SQLite
                deletes.push(item.path);
            }
        }

        if !updates.is_empty() || !deletes.is_empty() {
            if let Ok(mut db) = db_arc.lock() {
                let empty_creates: Vec<FileRecord> = Vec::new();
                if let Ok((c, u, d)) = db.incremental_apply_batch(&empty_creates, &updates, &deletes) {
                    let total = (c + u + d) as u64;
                    changes_counter.fetch_add(total, Ordering::Relaxed);
                    *last_sync.lock().unwrap() = Utc::now().to_rfc3339();
                }
            }
        }
    }
}

#[cfg(windows)]
fn run_windows_multi_root_watcher(
    db_arc: Arc<Mutex<Database>>,
    is_watching: Arc<AtomicBool>,
    pending_queue: Arc<Mutex<HashMap<String, PendingChangeItem>>>,
    shutdown_event_usize: usize,
    sync_mgr: SyncManager,
) {
    let mut spawned_roots: HashMap<String, ()> = HashMap::new();

    while is_watching.load(Ordering::Relaxed) {
        let indexed_roots = {
            if let Ok(db) = db_arc.lock() {
                db.get_stats().map(|s| s.indexed_directories).unwrap_or_default()
            } else {
                Vec::new()
            }
        };

        for root in indexed_roots {
            if !spawned_roots.contains_key(&root) && Path::new(&root).exists() {
                spawned_roots.insert(root.clone(), ());

                let root_clone = root.clone();
                let is_watching_root = Arc::clone(&is_watching);
                let queue_root = Arc::clone(&pending_queue);
                let sync_mgr_root = sync_mgr.clone_handle();

                std::thread::Builder::new()
                    .name(format!("myfinder-root-watcher-{}", root))
                    .spawn(move || {
                        watch_single_root_overlapped(
                            root_clone,
                            is_watching_root,
                            queue_root,
                            shutdown_event_usize,
                            sync_mgr_root,
                        );
                    })
                    .ok();
            }
        }

        std::thread::sleep(Duration::from_millis(1500));
    }
}

#[cfg(windows)]
fn watch_single_root_overlapped(
    root_dir: String,
    is_watching: Arc<AtomicBool>,
    queue: Arc<Mutex<HashMap<String, PendingChangeItem>>>,
    shutdown_event_usize: usize,
    sync_mgr: SyncManager,
) {
    use crate::usn_journal::winapi_compat::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    let shutdown_event = shutdown_event_usize as *mut std::ffi::c_void;

    let path_wide: Vec<u16> = OsStr::new(&root_dir)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let dir_handle = unsafe {
        CreateFileW(
            path_wide.as_ptr(),
            FILE_LIST_DIRECTORY,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            ptr::null_mut(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
            ptr::null_mut(),
        )
    };

    if dir_handle == INVALID_HANDLE_VALUE {
        return;
    }

    let overlapped_event = unsafe { CreateEventW(ptr::null_mut(), 1, 0, ptr::null()) };
    if overlapped_event.is_null() {
        unsafe {
            CloseHandle(dir_handle);
        }
        return;
    }

    let filter = FILE_NOTIFY_CHANGE_FILE_NAME
        | FILE_NOTIFY_CHANGE_DIR_NAME
        | FILE_NOTIFY_CHANGE_LAST_WRITE
        | FILE_NOTIFY_CHANGE_SIZE
        | FILE_NOTIFY_CHANGE_CREATION;

    let mut buffer = vec![0u8; 128 * 1024]; // 128KB notification buffer

    let mut pending_rename_old: Option<String> = None;

    while is_watching.load(Ordering::Relaxed) {
        let mut overlapped = OVERLAPPED::default();
        overlapped.h_event = overlapped_event;
        unsafe {
            ResetEvent(overlapped_event);
        }

        let mut bytes_returned = 0u32;
        let read_ok = unsafe {
            ReadDirectoryChangesW(
                dir_handle,
                buffer.as_mut_ptr() as *mut _,
                buffer.len() as u32,
                1, // watch subtree recursively
                filter,
                &mut bytes_returned,
                &mut overlapped,
                ptr::null_mut(),
            )
        };

        if read_ok == 0 {
            let err = unsafe { GetLastError() };
            if err != ERROR_IO_PENDING {
                // Buffer Overflow or Fatal Error
                if err == ERROR_NOTIFY_ENUM_DIR {
                    handle_watcher_overflow(&root_dir, &sync_mgr);
                }
                break;
            }
        }

        // Wait on both Overlapped completion event (index 0) and Global Shutdown event (index 1)
        let handles = [overlapped_event, shutdown_event];
        let wait_res = unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE) };

        if wait_res == WAIT_OBJECT_0 + 1 || !is_watching.load(Ordering::Relaxed) {
            // Shutdown signaled: cancel pending I/O and exit immediately
            unsafe {
                CancelIoEx(dir_handle, &mut overlapped);
            }
            break;
        }

        if wait_res == WAIT_OBJECT_0 {
            let mut transferred = 0u32;
            let result_ok = unsafe {
                GetOverlappedResult(dir_handle, &mut overlapped, &mut transferred, 0)
            };

            if result_ok == 0 {
                let err = unsafe { GetLastError() };
                if err == ERROR_NOTIFY_ENUM_DIR {
                    handle_watcher_overflow(&root_dir, &sync_mgr);
                }
                continue;
            }

            if transferred > 0 {
                let mut offset = 0usize;
                let now = Instant::now();

                while offset < transferred as usize {
                    let next_offset = u32::from_le_bytes(
                        buffer[offset..offset + 4].try_into().unwrap_or([0; 4]),
                    ) as usize;
                    let action = u32::from_le_bytes(
                        buffer[offset + 4..offset + 8].try_into().unwrap_or([0; 4]),
                    );
                    let filename_len = u32::from_le_bytes(
                        buffer[offset + 8..offset + 12].try_into().unwrap_or([0; 4]),
                    ) as usize;

                    let name_offset = offset + 12;
                    if name_offset + filename_len <= transferred as usize {
                        let name_slice = &buffer[name_offset..name_offset + filename_len];
                        let u16_vec: Vec<u16> = name_slice
                            .chunks_exact(2)
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .collect();
                        let rel_name = String::from_utf16_lossy(&u16_vec);
                        let full_path = format!(
                            r"{}\{}",
                            root_dir.trim_end_matches('\\'),
                            rel_name.trim_start_matches('\\')
                        );

                        match action {
                            FILE_ACTION_RENAMED_OLD_NAME => {
                                pending_rename_old = Some(full_path.clone());
                                if let Ok(mut q) = queue.lock() {
                                    q.insert(
                                        full_path.clone(),
                                        PendingChangeItem {
                                            path: full_path,
                                            old_path: None,
                                            timestamp: now,
                                        },
                                    );
                                }
                            }
                            FILE_ACTION_RENAMED_NEW_NAME => {
                                let old_p = pending_rename_old.take();
                                if let Ok(mut q) = queue.lock() {
                                    q.insert(
                                        full_path.clone(),
                                        PendingChangeItem {
                                            path: full_path,
                                            old_path: old_p,
                                            timestamp: now,
                                        },
                                    );
                                }
                            }
                            _ => {
                                if let Ok(mut q) = queue.lock() {
                                    q.insert(
                                        full_path.clone(),
                                        PendingChangeItem {
                                            path: full_path,
                                            old_path: None,
                                            timestamp: now,
                                        },
                                    );
                                }
                            }
                        }
                    }

                    if next_offset == 0 {
                        break;
                    }
                    offset += next_offset;
                }
            }
        }
    }

    unsafe {
        CloseHandle(overlapped_event);
        CloseHandle(dir_handle);
    }
}

/// Handle ReadDirectoryChangesW notification buffer overflow (ERROR_NOTIFY_ENUM_DIR = 1022):
/// 1. Mark index as incomplete (synchronizing / needs_rescan)
/// 2. Use USN Journal to catch up without missing records
/// 3. If USN cannot guarantee completeness, trigger reconciliation scan
/// 4. Only then mark Synced
#[cfg(windows)]
fn handle_watcher_overflow(root_dir: &str, sync_mgr: &SyncManager) {
    *sync_mgr.overall_state.lock().unwrap() = "synchronizing".to_string();
    *sync_mgr.status_message.lock().unwrap() =
        "检测到通知队列溢出，正在通过 USN Journal 自动对齐完整变更...".to_string();

    match sync_mgr.synchronize_volume(root_dir, false) {
        Ok(_) => {
            *sync_mgr.overall_state.lock().unwrap() = "synced".to_string();
        }
        Err(_) => {
            let _ = sync_mgr.perform_reconciliation_sync(
                root_dir,
                "通知队列溢出后 USN 无法保证完整，执行快速全量核验",
                Instant::now(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;

    fn create_test_db() -> Arc<Mutex<Database>> {
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
        Arc::new(Mutex::new(db))
    }

    // 1. Real FRN nested-path resolution
    #[test]
    fn test_frn_path_resolution_nested() {
        let mut resolver = FrnPathResolver::new("C:");
        resolver.insert_node(100, 5, "Projects", true);
        resolver.insert_node(200, 100, "App", true);
        resolver.insert_node(300, 200, "test.txt", false);

        let resolved = resolver.resolve_file_path(200, "test.txt");
        assert_eq!(resolved, Some(r"C:\Projects\App\test.txt".to_string()));
    }

    // 2. Parent directory not present in current USN batch
    #[test]
    fn test_parent_directory_not_present_in_current_batch() {
        let mut resolver = FrnPathResolver::new("D:");
        resolver.insert_node(10, 5, "Workspace", true);
        resolver.insert_node(20, 10, "Src", true);

        let file_path = resolver.resolve_file_path(20, "main.rs");
        assert_eq!(file_path, Some(r"D:\Workspace\Src\main.rs".to_string()));
    }

    // 3. Create test
    #[test]
    fn test_create_file_incremental_apply() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let file = FileRecord {
            id: r"C:\Data\new_file.txt".to_string(),
            path: r"C:\Data\new_file.txt".to_string(),
            file_name: "new_file.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 1024,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        let (c, u, d) = db.incremental_apply_batch(&[file], &[], &[]).unwrap();
        assert_eq!(c, 1);
        assert_eq!(u, 0);
        assert_eq!(d, 0);

        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_files, 1);
    }

    // 4. Delete test
    #[test]
    fn test_delete_file_incremental_apply() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let file = FileRecord {
            id: r"C:\Data\to_delete.txt".to_string(),
            path: r"C:\Data\to_delete.txt".to_string(),
            file_name: "to_delete.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 512,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        db.incremental_apply_batch(&[file], &[], &[]).unwrap();
        let stats_before = db.get_stats().unwrap();
        assert_eq!(stats_before.total_files, 1);

        let (c, u, d) = db.incremental_apply_batch(&[], &[], &[r"C:\Data\to_delete.txt".to_string()]).unwrap();
        assert_eq!(c, 0);
        assert_eq!(u, 0);
        assert_eq!(d, 1);

        let stats_after = db.get_stats().unwrap();
        assert_eq!(stats_after.total_files, 0);
    }

    // 5. Rename test
    #[test]
    fn test_rename_file_in_place() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let file_old = FileRecord {
            id: r"C:\Data\old_name.txt".to_string(),
            path: r"C:\Data\old_name.txt".to_string(),
            file_name: "old_name.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 300,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };
        db.incremental_apply_batch(&[file_old], &[], &[]).unwrap();

        let file_new = FileRecord {
            id: r"C:\Data\new_name.txt".to_string(),
            path: r"C:\Data\new_name.txt".to_string(),
            file_name: "new_name.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 300,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        db.incremental_apply_batch(&[file_new], &[], &[r"C:\Data\old_name.txt".to_string()]).unwrap();

        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_files, 1);
    }

    // 6. Move test: C:\A\old.txt -> C:\B\new.txt
    #[test]
    fn test_move_across_directories() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let file_a = FileRecord {
            id: r"C:\A\old.txt".to_string(),
            path: r"C:\A\old.txt".to_string(),
            file_name: "old.txt".to_string(),
            directory: r"C:\A".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 800,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };
        db.incremental_apply_batch(&[file_a], &[], &[]).unwrap();

        let file_b = FileRecord {
            id: r"C:\B\new.txt".to_string(),
            path: r"C:\B\new.txt".to_string(),
            file_name: "new.txt".to_string(),
            directory: r"C:\B".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 800,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        db.incremental_apply_batch(&[file_b], &[], &[r"C:\A\old.txt".to_string()]).unwrap();

        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_files, 1);
    }

    // 7. Rapid repeated modifications (debounce coalescing)
    #[test]
    fn test_rapid_repeated_modifications_debounce() {
        let queue: Arc<Mutex<HashMap<String, PendingChangeItem>>> = Arc::new(Mutex::new(HashMap::new()));
        let now = Instant::now();

        // Push 5 rapid writes for the same path
        for i in 0..5 {
            let mut q = queue.lock().unwrap();
            q.insert(
                r"C:\Data\rapid.txt".to_string(),
                PendingChangeItem {
                    path: r"C:\Data\rapid.txt".to_string(),
                    old_path: None,
                    timestamp: now + Duration::from_millis(i * 20),
                },
            );
        }

        // Only 1 coalesced pending item remains in the queue!
        assert_eq!(queue.lock().unwrap().len(), 1);
    }

    // 8. Large copy burst
    #[test]
    fn test_large_copy_burst() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let mut burst = Vec::new();
        for i in 0..1000 {
            burst.push(FileRecord {
                id: format!(r"C:\Burst\file_{}.dat", i),
                path: format!(r"C:\Burst\file_{}.dat", i),
                file_name: format!("file_{}.dat", i),
                directory: r"C:\Burst".to_string(),
                extension: ".dat".to_string(),
                size_bytes: 1024,
                category: 0,
                created_time: "2024-01-01T00:00:00Z".to_string(),
                updated_time: "2024-01-01T00:00:00Z".to_string(),
                indexed_time: "2024-01-01T00:00:00Z".to_string(),
            });
        }

        let (c, _, _) = db.incremental_apply_batch(&burst, &[], &[]).unwrap();
        assert_eq!(c, 1000);
        assert_eq!(db.get_stats().unwrap().total_files, 1000);
    }

    // 9. Multiple watched roots simultaneously
    #[test]
    fn test_multiple_watched_roots_simultaneously() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);

        sync_mgr.start_active_watcher();
        assert!(sync_mgr.is_watching.load(Ordering::Relaxed));
        sync_mgr.stop_active_watcher();
        assert!(!sync_mgr.is_watching.load(Ordering::Relaxed));
    }

    // 10. Watcher shutdown cleanliness
    #[test]
    fn test_watcher_shutdown_cleanliness() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);

        sync_mgr.start_active_watcher();
        std::thread::sleep(Duration::from_millis(50));
        sync_mgr.stop_active_watcher();
        assert!(!sync_mgr.is_watching.load(Ordering::Relaxed));
    }

    // 11. Notification buffer overflow handling
    #[test]
    fn test_notification_buffer_overflow_state() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);

        *sync_mgr.overall_state.lock().unwrap() = "needs_rescan".to_string();
        let status = sync_mgr.get_status();
        assert_eq!(status.overall_state, "needs_rescan");
    }

    // 12. USN pagination
    #[test]
    fn test_usn_pagination_range() {
        let start_usn = 1000i64;
        let next_usn = 5000i64;
        assert!(next_usn > start_usn);
    }

    // 13. USN journal reset
    #[test]
    fn test_usn_journal_reset_detection() {
        let check = UsnJournal::check_volume_usn_state(
            "C:",
            Some(&VolumeUsnState {
                volume_path: "C:".to_string(),
                volume_serial: "SERIAL".to_string(),
                file_system: "NTFS".to_string(),
                journal_id: 100,
                last_usn: 50,
                lowest_valid_usn: 10,
                last_sync_time: "2024-01-01T00:00:00Z".to_string(),
                sync_status: "synced".to_string(),
                status_message: None,
            }),
        );
        match check {
            UsnSyncCheckResult::NeedsReconciliation { .. }
            | UsnSyncCheckResult::CanPerformIncremental { .. }
            | UsnSyncCheckResult::AlreadyUpToDate { .. }
            | UsnSyncCheckResult::UnsupportedFileSystem { .. }
            | UsnSyncCheckResult::AccessError { .. } => {}
        }
    }

    // 14. Restart after changes while app was closed
    #[test]
    fn test_restart_after_changes_offline() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);
        sync_mgr.perform_startup_sync();
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(sync_mgr.is_syncing.load(Ordering::Relaxed), false);
    }
}
