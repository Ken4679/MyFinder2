// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod models;
pub mod path_policy;
mod scanner;
mod security_analyzer;
mod software_scanner;
mod sync_manager;
mod uninstall_manager;
mod usn_journal;

use commands::AppState;
use db::Database;
use models::IndexingStatus;
use sync_manager::SyncManager;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub fn get_portable_data_dir() -> PathBuf {
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate = exe_dir.join("data");
            let _ = fs::create_dir_all(&candidate);
            return candidate;
        }
    }
    let fallback = PathBuf::from("./data");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn main() {
    let data_dir = get_portable_data_dir();

    // Set WebView2 user data folder to `./data` for pure 100% portable mode
    env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);

    // Initialize local SQLite database in portable data directory
    let db = Database::new(&data_dir).expect("Failed to initialize SQLite database");
    let db_arc = Arc::new(Mutex::new(db));
    let sync_manager = Arc::new(SyncManager::new(Arc::clone(&db_arc)));

    let app_state = AppState {
        db: db_arc,
        status: Arc::new(Mutex::new(IndexingStatus::default())),
        cancel_token: Arc::new(AtomicBool::new(false)),
        sync_manager: sync_manager.clone(),
    };

    // Auto-start active watcher on application open (strictly read-only)
    sync_manager.start_active_watcher();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::start_indexing,
            commands::cancel_indexing,
            commands::get_indexing_status,
            commands::search_files,
            commands::get_indexed_files,
            commands::get_index_stats,
            commands::remove_directory_from_index,
            commands::optimize_database,
            commands::wipe_index,
            commands::verify_file_exists,
            commands::open_file_native,
            commands::reveal_in_explorer_native,
            commands::open_folder_native,
            commands::scan_installed_software,
            commands::precheck_software_uninstall,
            commands::detect_software_leftovers,
            commands::read_uninstall_audit_logs,
            commands::inspect_file_security,
            commands::inspect_software_security,
            commands::calculate_file_hash,
            commands::get_sync_status,
            commands::trigger_incremental_sync,
            commands::start_fs_watcher,
            commands::stop_fs_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
