// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;

fn main() {
    // Force 100% Self-Contained Portable Mode:
    // Store all WebView2 cache, localStorage, cookies, and indexes in `./data` next to the EXE
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let data_dir = exe_dir.join("data");
            let _ = fs::create_dir_all(&data_dir);
            env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

