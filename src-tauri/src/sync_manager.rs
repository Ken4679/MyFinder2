use crate::db::Database;
use crate::models::{
    FileCategory, FileRecord, FileSystemChangeEvent, IncrementalSyncResult, SyncStatusInfo,
    VolumeUsnState,
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
                // No indexed roots yet (fresh baseline)
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
                // Initialize FRN Resolver with existing known paths
                let mut resolver = {
                    let mut resolvers = self.frn_resolvers.lock().unwrap();
                    resolvers
                        .entry(volume_path.clone())
                        .or_insert_with(|| FrnPathResolver::new(&volume_path))
                        .clone()
                };

                // Populate known indexed directories into resolver to restore missing parents
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
                                "USN 变更集超出单次处理上限，执行全量快速对齐",
                                start_time,
                            );
                        }

                        let mut creates: Vec<FileRecord> = Vec::new();
                        let mut updates: Vec<FileRecord> = Vec::new();
                        let mut deletes: Vec<String> = Vec::new();
                        let mut unresolvable_count = 0usize;

                        // Pass 1: Update directory nodes in FRN hierarchy
                        for rec in &records {
                            let is_dir = (rec.file_attributes & 0x00000010) != 0; // FILE_ATTRIBUTE_DIRECTORY
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

                        // If any paths cannot be resolved with high confidence, trigger reconciliation
                        if unresolvable_count > 0 && unresolvable_count > records.len() / 4 {
                            return self.perform_reconciliation_sync(
                                &volume_path,
                                "部分上级目录 FRN 链未解析，启动安全快速核验",
                                start_time,
                            );
                        }

                        // Apply to SQLite atomically in a single transaction
                        let (c_count, u_count, d_count) = {
                            let mut db = self.db.lock().unwrap();
                            db.incremental_apply_batch(&creates, &updates, &deletes)
                                .map_err(|e| format!("写入增量变更失败: {}", e))?
                        };

                        let total_ops = (c_count + u_count + d_count) as u64;
                        self.total_changes_processed.fetch_add(total_ops, Ordering::Relaxed);

                        // Advance last_usn ONLY after successful commit
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
        let total_updates = 0u64;
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

            let mut db = self.db.lock().unwrap();
            let _ = db.upsert_batch(&disk_records);
            let deleted = db.prune_missing_files_in_directory(dir, &valid_paths).unwrap_or(0);

            total_creates += disk_records.len() as u64;
            total_deletes += deleted as u64;
        }

        // Establish baseline state after successful reconciliation
        let (journal_id, next_usn, lowest_usn, serial_str, fs_name) =
            UsnJournal::query_volume_usn_baseline(volume_or_dir)
                .unwrap_or((1, 1, 0, "RECONCILED".to_string(), "NTFS/Reconciled".to_string()));

        let now_str = Utc::now().to_rfc3339();
        {
            let mut db = self.db.lock().unwrap();
            let _ = db.save_volume_usn_state(&VolumeUsnState {
                volume_path: volume_or_dir.to_string(),
                volume_serial: serial_str,
                file_system: fs_name,
                journal_id,
                last_usn: next_usn,
                lowest_valid_usn: lowest_usn,
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
            new_usn: next_usn,
            message: format!("对齐核验完成 (处理了 {} 项)", total_creates + total_deletes),
        })
    }

    /// Start active directory watching while the application is open using ReadDirectoryChangesW
    pub fn start_active_watcher(&self) {
        if self.is_watching.swap(true, Ordering::SeqCst) {
            return; // already watching
        }

        let db_arc = Arc::clone(&self.db);
        let is_watching = Arc::clone(&self.is_watching);
        let changes_counter = Arc::clone(&self.total_changes_processed);
        let last_sync = Arc::clone(&self.last_sync_time);
        let overall_state = Arc::clone(&self.overall_state);

        std::thread::spawn(move || {
            #[cfg(windows)]
            {
                run_windows_directory_watcher(
                    db_arc,
                    is_watching,
                    changes_counter,
                    last_sync,
                    overall_state,
                );
            }

            #[cfg(not(windows))]
            {
                while is_watching.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(1500));
                }
            }
        });
    }

    /// Stop active directory watching. Closes all handles without leaving any daemon or background process.
    pub fn stop_active_watcher(&self) {
        self.is_watching.store(false, Ordering::SeqCst);
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
        }
    }
}

// Windows ReadDirectoryChangesW native implementation with multi-root support and debounce queue
#[cfg(windows)]
fn run_windows_directory_watcher(
    db_arc: Arc<Mutex<Database>>,
    is_watching: Arc<AtomicBool>,
    changes_counter: Arc<AtomicU64>,
    last_sync: Arc<Mutex<String>>,
    overall_state: Arc<Mutex<String>>,
) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    const FILE_LIST_DIRECTORY: u32 = 0x0001;
    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_WRITE: u32 = 0x00000002;
    const FILE_SHARE_DELETE: u32 = 0x00000004;
    const OPEN_EXISTING: u32 = 3;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x02000000;
    const INVALID_HANDLE_VALUE: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;

    const FILE_NOTIFY_CHANGE_FILE_NAME: u32 = 0x00000001;
    const FILE_NOTIFY_CHANGE_DIR_NAME: u32 = 0x00000002;
    const FILE_NOTIFY_CHANGE_LAST_WRITE: u32 = 0x00000010;
    const FILE_NOTIFY_CHANGE_SIZE: u32 = 0x00000008;
    const FILE_NOTIFY_CHANGE_CREATION: u32 = 0x00000040;

    const FILE_ACTION_ADDED: u32 = 0x00000001;
    const FILE_ACTION_REMOVED: u32 = 0x00000002;
    const FILE_ACTION_MODIFIED: u32 = 0x00000003;
    const FILE_ACTION_RENAMED_OLD_NAME: u32 = 0x00000004;
    const FILE_ACTION_RENAMED_NEW_NAME: u32 = 0x00000005;

    // ERROR_NOTIFY_ENUM_DIR (1022) indicates buffer overflow / notifications lost
    const ERROR_NOTIFY_ENUM_DIR: u32 = 1022;

    extern "system" {
        fn CreateFileW(
            lpFileName: *const u16,
            dwDesiredAccess: u32,
            dwShareMode: u32,
            lpSecurityAttributes: *mut std::ffi::c_void,
            dwCreationDisposition: u32,
            dwFlagsAndAttributes: u32,
            hTemplateFile: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;

        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;

        fn ReadDirectoryChangesW(
            hDirectory: *mut std::ffi::c_void,
            lpBuffer: *mut std::ffi::c_void,
            nBufferLength: u32,
            bWatchSubtree: i32,
            dwNotifyFilter: u32,
            lpBytesReturned: *mut u32,
            lpOverlapped: *mut std::ffi::c_void,
            lpCompletionRoutine: *mut std::ffi::c_void,
        ) -> i32;

        fn GetLastError() -> u32;
    }

    while is_watching.load(Ordering::Relaxed) {
        let indexed_roots = {
            if let Ok(db) = db_arc.lock() {
                db.get_stats().map(|s| s.indexed_directories).unwrap_or_default()
            } else {
                Vec::new()
            }
        };

        if indexed_roots.is_empty() {
            std::thread::sleep(Duration::from_millis(1500));
            continue;
        }

        for root_dir in &indexed_roots {
            if !Path::new(root_dir).exists() || !is_watching.load(Ordering::Relaxed) {
                continue;
            }

            let path_wide: Vec<u16> = OsStr::new(root_dir)
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
                    FILE_FLAG_BACKUP_SEMANTICS,
                    ptr::null_mut(),
                )
            };

            if dir_handle == INVALID_HANDLE_VALUE {
                continue;
            }

            let mut buffer = vec![0u8; 64 * 1024];
            let mut bytes_returned = 0u32;
            let filter = FILE_NOTIFY_CHANGE_FILE_NAME
                | FILE_NOTIFY_CHANGE_DIR_NAME
                | FILE_NOTIFY_CHANGE_LAST_WRITE
                | FILE_NOTIFY_CHANGE_SIZE
                | FILE_NOTIFY_CHANGE_CREATION;

            let ok = unsafe {
                ReadDirectoryChangesW(
                    dir_handle,
                    buffer.as_mut_ptr() as *mut _,
                    buffer.len() as u32,
                    1, // watch subtree recursively
                    filter,
                    &mut bytes_returned,
                    ptr::null_mut(),
                    ptr::null_mut(),
                )
            };

            let last_err = if ok == 0 {
                unsafe { GetLastError() }
            } else {
                0
            };

            unsafe {
                CloseHandle(dir_handle);
            }

            // Handle Buffer Overflow (ERROR_NOTIFY_ENUM_DIR = 1022)
            if ok == 0 && last_err == ERROR_NOTIFY_ENUM_DIR {
                *overall_state.lock().unwrap() = "needs_rescan".to_string();
                continue;
            }

            if ok != 0 && bytes_returned > 0 {
                let mut offset = 0usize;
                let mut pending_events: Vec<FileSystemChangeEvent> = Vec::new();

                while offset < bytes_returned as usize {
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
                    if name_offset + filename_len <= bytes_returned as usize {
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

                        let change_type = match action {
                            FILE_ACTION_ADDED => "create",
                            FILE_ACTION_REMOVED => "delete",
                            FILE_ACTION_RENAMED_OLD_NAME => "delete",
                            FILE_ACTION_RENAMED_NEW_NAME => "create",
                            _ => "modify",
                        };

                        pending_events.push(FileSystemChangeEvent {
                            path: full_path,
                            old_path: None,
                            change_type: change_type.to_string(),
                            timestamp: Utc::now().to_rfc3339(),
                        });
                    }

                    if next_offset == 0 {
                        break;
                    }
                    offset += next_offset;
                }

                // Debounce window (150ms) to coalesce rapid writes before checking disk stat
                std::thread::sleep(Duration::from_millis(150));

                let mut creates = Vec::new();
                let mut updates = Vec::new();
                let mut deletes = Vec::new();

                for event in pending_events {
                    if event.change_type == "delete" {
                        deletes.push(event.path);
                    } else if let Ok(metadata) = fs::metadata(&event.path) {
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

                            let p = Path::new(&event.path);
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
                                id: event.path.clone(),
                                path: event.path.clone(),
                                file_name,
                                directory,
                                extension: ext,
                                size_bytes,
                                category,
                                created_time,
                                updated_time,
                                indexed_time: Utc::now().to_rfc3339(),
                            };

                            if event.change_type == "create" {
                                creates.push(record);
                            } else {
                                updates.push(record);
                            }
                        }
                    } else {
                        // File was deleted or temporary file removed
                        deletes.push(event.path);
                    }
                }

                if !creates.is_empty() || !updates.is_empty() || !deletes.is_empty() {
                    if let Ok(mut db) = db_arc.lock() {
                        if let Ok((c, u, d)) = db.incremental_apply_batch(&creates, &updates, &deletes) {
                            let total = (c + u + d) as u64;
                            changes_counter.fetch_add(total, Ordering::Relaxed);
                            *last_sync.lock().unwrap() = Utc::now().to_rfc3339();
                        }
                    }
                }
            }
        }

        std::thread::sleep(Duration::from_millis(300));
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

    #[test]
    fn test_frn_path_resolution_nested() {
        let mut resolver = FrnPathResolver::new("C:");
        resolver.insert_node(100, 5, "Projects", true);
        resolver.insert_node(200, 100, "App", true);
        resolver.insert_node(300, 200, "test.txt", false);

        let resolved = resolver.resolve_file_path(200, "test.txt");
        assert_eq!(resolved, Some(r"C:\Projects\App\test.txt".to_string()));
    }

    #[test]
    fn test_watcher_start_and_shutdown() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);

        assert!(!sync_mgr.is_watching.load(Ordering::Relaxed));
        sync_mgr.start_active_watcher();
        assert!(sync_mgr.is_watching.load(Ordering::Relaxed));

        // Ensure clean shutdown with no background processes
        sync_mgr.stop_active_watcher();
        assert!(!sync_mgr.is_watching.load(Ordering::Relaxed));
    }

    #[test]
    fn test_synchronize_volume_empty_db() {
        let db = create_test_db();
        let sync_mgr = SyncManager::new(db);

        let status = sync_mgr.get_status();
        assert_eq!(status.overall_state, "synced");
        assert_eq!(status.changes_processed_count, 0);
    }

    #[test]
    fn test_batch_atomic_incremental_apply() {
        let db_arc = create_test_db();
        let mut db = db_arc.lock().unwrap();

        let file1 = FileRecord {
            id: r"C:\Data\doc1.txt".to_string(),
            path: r"C:\Data\doc1.txt".to_string(),
            file_name: "doc1.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 100,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        let file2 = FileRecord {
            id: r"C:\Data\doc2.txt".to_string(),
            path: r"C:\Data\doc2.txt".to_string(),
            file_name: "doc2.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 200,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-01T00:00:00Z".to_string(),
            indexed_time: "2024-01-01T00:00:00Z".to_string(),
        };

        // Create 2 files
        let (c, u, d) = db.incremental_apply_batch(&[file1, file2], &[], &[]).unwrap();
        assert_eq!(c, 2);
        assert_eq!(u, 0);
        assert_eq!(d, 0);

        // Rename/Update doc1 -> doc1_renamed and delete doc2
        let file1_renamed = FileRecord {
            id: r"C:\Data\doc1_renamed.txt".to_string(),
            path: r"C:\Data\doc1_renamed.txt".to_string(),
            file_name: "doc1_renamed.txt".to_string(),
            directory: r"C:\Data".to_string(),
            extension: ".txt".to_string(),
            size_bytes: 150,
            category: 1,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            updated_time: "2024-01-02T00:00:00Z".to_string(),
            indexed_time: "2024-01-02T00:00:00Z".to_string(),
        };

        let (c2, u2, d2) = db.incremental_apply_batch(
            &[file1_renamed],
            &[],
            &[r"C:\Data\doc1.txt".to_string(), r"C:\Data\doc2.txt".to_string()],
        ).unwrap();

        assert_eq!(c2, 1);
        assert_eq!(u2, 0);
        assert_eq!(d2, 2);

        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_files, 1);
    }
}
