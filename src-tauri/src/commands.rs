use crate::db::Database;
use crate::models::{
    AuditLogEntry, CleanupExecutionReport, CleanupPlan, FileRecord, HashResult, IndexStats,
    IndexingStatus, LeftoverCandidate, SearchFilter, SecurityAssessment, SoftwareRecord,
    UninstallLaunchResult, UninstallPrecheckInfo,
};
use crate::scanner::Scanner;
use crate::security_analyzer::SecurityAnalyzer;
use crate::software_scanner::SoftwareScanner;
use crate::uninstall_manager::UninstallManager;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, State};

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub status: Arc<Mutex<IndexingStatus>>,
    pub cancel_token: Arc<AtomicBool>,
}

#[tauri::command]
pub fn start_indexing(
    target_path: String,
    recursive: Option<bool>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path_clone = target_path.clone();
    let is_recursive = recursive.unwrap_or(true);

    // Prevent starting duplicate concurrent scans
    if let Ok(status) = state.status.lock() {
        if status.state == "indexing" || status.state == "cancelling" {
            return Err("已有扫描任务正在执行中，请等待完成或取消后再试".to_string());
        }
    }

    // Reset cancel token
    state.cancel_token.store(false, Ordering::Relaxed);

    let db_arc = Arc::clone(&state.db);
    let status_arc = Arc::clone(&state.status);
    let cancel_arc = Arc::clone(&state.cancel_token);

    // Launch scan in a background worker thread so UI never freezes
    thread::spawn(move || {
        let _ = Scanner::scan_directory(
            &path_clone,
            is_recursive,
            db_arc,
            status_arc,
            cancel_arc,
        );
    });

    Ok(format!("已启动对 {} 的后台索引", target_path))
}

#[tauri::command]
pub fn cancel_indexing(state: State<'_, AppState>) -> Result<bool, String> {
    state.cancel_token.store(true, Ordering::Relaxed);
    if let Ok(mut status) = state.status.lock() {
        if status.state == "indexing" {
            status.state = "cancelling".to_string();
            status.message = Some("正在安全中止扫描任务...".to_string());
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn get_indexing_status(state: State<'_, AppState>) -> Result<IndexingStatus, String> {
    let status = state
        .status
        .lock()
        .map_err(|e| format!("锁状态错误: {}", e))?;
    Ok(status.clone())
}

#[tauri::command]
pub fn search_files(
    filter: SearchFilter,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.search(&filter).map_err(|e| format!("检索错误: {}", e))
}

#[tauri::command]
pub fn get_indexed_files(
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.get_all_or_recent(limit.unwrap_or(100), offset.unwrap_or(0))
        .map_err(|e| format!("读取文件列表错误: {}", e))
}

#[tauri::command]
pub fn get_index_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.get_stats().map_err(|e| format!("获取统计信息错误: {}", e))
}

#[tauri::command]
pub fn remove_directory_from_index(
    dir_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.delete_directory_and_files(&dir_path)
        .map_err(|e| format!("删除目录索引失败: {}", e))
}

#[tauri::command]
pub fn optimize_database(state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.optimize().map_err(|e| format!("优化数据库失败: {}", e))
}

#[tauri::command]
pub fn wipe_index(state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state
        .db
        .lock()
        .map_err(|e| format!("数据库锁错误: {}", e))?;
    db.wipe().map_err(|e| format!("清空索引失败: {}", e))
}

#[tauri::command]
pub fn verify_file_exists(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);
    Ok(path.exists())
}

#[tauri::command]
pub fn open_file_native(file_path: String, _app_handle: AppHandle) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件在磁盘上不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        // Native Windows URL/File protocol handler directly without invoking cmd.exe shell
        let _ = Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &file_path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("xdg-open").arg(&file_path).spawn();
        return Ok(());
    }
}

#[tauri::command]
pub fn reveal_in_explorer_native(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件在磁盘上不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer")
            .arg(format!("/select,{}", file_path))
            .spawn();
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(parent) = path.parent() {
            let _ = Command::new("xdg-open").arg(parent).spawn();
        }
        return Ok(());
    }
}

#[tauri::command]
pub fn open_folder_native(folder_path: String) -> Result<(), String> {
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err(format!("目录在磁盘上不存在: {}", folder_path));
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer").arg(&folder_path).spawn();
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("xdg-open").arg(&folder_path).spawn();
        return Ok(());
    }
}

#[tauri::command]
pub fn scan_installed_software() -> Result<Vec<SoftwareRecord>, String> {
    SoftwareScanner::scan_all()
}

#[tauri::command]
pub fn precheck_software_uninstall(software: SoftwareRecord) -> Result<UninstallPrecheckInfo, String> {
    Ok(UninstallManager::precheck_uninstall(&software))
}

#[tauri::command]
pub fn launch_software_uninstaller(software: SoftwareRecord) -> Result<UninstallLaunchResult, String> {
    UninstallManager::launch_official_uninstaller(&software)
}

#[tauri::command]
pub fn detect_software_leftovers(software: SoftwareRecord) -> Result<Vec<LeftoverCandidate>, String> {
    Ok(UninstallManager::detect_leftovers(&software))
}

#[tauri::command]
pub fn execute_software_cleanup(plan: CleanupPlan) -> Result<CleanupExecutionReport, String> {
    Ok(UninstallManager::execute_cleanup(plan))
}

#[tauri::command]
pub fn read_uninstall_audit_logs() -> Result<Vec<AuditLogEntry>, String> {
    let log_file = crate::get_portable_data_dir().join("logs").join("uninstall_audit.jsonl");
    if !log_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(log_file).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(line) {
            entries.push(entry);
        }
    }
    entries.reverse(); // latest first
    Ok(entries)
}

#[tauri::command]
pub fn inspect_file_security(file_path: String) -> Result<SecurityAssessment, String> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err(format!("文件不存在或已被移动: {}", file_path));
    }
    Ok(SecurityAnalyzer::assess_file_security(p, None))
}

#[tauri::command]
pub fn inspect_software_security(software: SoftwareRecord) -> Result<SecurityAssessment, String> {
    Ok(SecurityAnalyzer::assess_software_security(&software))
}

#[tauri::command]
pub fn calculate_file_hash(file_path: String) -> Result<HashResult, String> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err(format!("文件不存在或已被移动: {}", file_path));
    }
    SecurityAnalyzer::calculate_sha256(p)
}


