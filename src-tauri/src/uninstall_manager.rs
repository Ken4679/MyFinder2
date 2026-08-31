use crate::models::{
    AuditLogEntry, CleanupExecutionReport, CleanupItemResult, CleanupPlan, LeftoverCandidate,
    LeftoverConfidence, LeftoverItemType, LeftoverRisk, SoftwareRecord, UninstallLaunchResult,
    UninstallPrecheckInfo,
};
use crate::path_policy::PathPolicy;
use chrono::Local;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use uuid::Uuid;

#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS};
#[cfg(target_os = "windows")]
use winreg::RegKey;

// Backend-owned Candidate Cache for P0 Cleanup Authorization
static CANDIDATE_CACHE: Mutex<Option<HashMap<String, LeftoverCandidate>>> = Mutex::new(None);

pub struct UninstallManager;

impl UninstallManager {
    // =========================================================================
    // 1. Centralized System Path Protection Policy (Delegate to PathPolicy)
    // =========================================================================
    pub fn is_path_protected(path: &Path) -> bool {
        PathPolicy::is_protected(path)
    }

    // =========================================================================
    // 2. Safe Uninstall Command Parsing
    // =========================================================================
    pub fn parse_uninstall_command(raw_cmd: &str) -> (String, Vec<String>, String) {
        let trimmed = raw_cmd.trim();
        if trimmed.is_empty() {
            return (String::new(), Vec::new(), "none".to_string());
        }

        let lower = trimmed.to_lowercase();

        // 1. MSI command detection (e.g. MsiExec.exe /I{...} or msiexec /x{...})
        if lower.contains("msiexec") || lower.contains("msi.dll") {
            // Find GUID {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
            if let Some(start) = trimmed.find('{') {
                if let Some(end) = trimmed[start..].find('}') {
                    let guid = &trimmed[start..=start + end];
                    return (
                        "msiexec.exe".to_string(),
                        vec!["/x".to_string(), guid.to_string()],
                        "msi".to_string(),
                    );
                }
            }
            return (
                "msiexec.exe".to_string(),
                vec!["/x".to_string(), trimmed.to_string()],
                "msi".to_string(),
            );
        }

        // 2. Standard executable command parsing
        let mut tokens: Vec<String> = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;

        for ch in trimmed.chars() {
            match ch {
                '"' => {
                    in_quotes = !in_quotes;
                }
                ' ' | '\t' if !in_quotes => {
                    if !current.is_empty() {
                        tokens.push(current.clone());
                        current.clear();
                    }
                }
                _ => {
                    current.push(ch);
                }
            }
        }
        if !current.is_empty() {
            tokens.push(current);
        }

        if tokens.is_empty() {
            return (String::new(), Vec::new(), "none".to_string());
        }

        let exe_path = tokens[0].clone();
        let args = tokens[1..].to_vec();
        (exe_path, args, "exe".to_string())
    }

    // =========================================================================
    // 3. Uninstall Pre-check
    // =========================================================================
    pub fn precheck_uninstall(software: &SoftwareRecord) -> UninstallPrecheckInfo {
        let (exe_path, _, kind) = Self::parse_uninstall_command(
            software
                .uninstall_command
                .as_deref()
                .unwrap_or_default(),
        );

        let uninstaller_type = match kind.as_str() {
            "msi" => "msi",
            "exe" => "exe",
            _ => "none",
        };

        let uninstaller_exists = if uninstaller_type == "msi" {
            true // msiexec is always a system binary
        } else if !exe_path.is_empty() {
            Path::new(&exe_path).exists()
        } else {
            false
        };

        let mut is_running = false;
        if let Some(ref main_exe) = software.main_exe_path {
            if let Some(exe_name) = Path::new(main_exe).file_name().and_then(|n| n.to_str()) {
                is_running = Self::is_process_running(exe_name);
            }
        }

        UninstallPrecheckInfo {
            software_id: software.id.clone(),
            software_name: software.display_name.clone(),
            publisher: software.publisher.clone(),
            version: software.version.clone(),
            install_location: software.install_location.clone(),
            uninstaller_type: uninstaller_type.to_string(),
            uninstaller_path: if exe_path.is_empty() {
                None
            } else {
                Some(exe_path)
            },
            uninstaller_exists,
            uninstall_command: software.uninstall_command.clone(),
            is_running,
        }
    }

    pub fn is_process_running(process_name: &str) -> bool {
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("IMAGENAME eq {}", process_name), "/NH"])
                .output();
            if let Ok(out) = output {
                let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
                return text.contains(&process_name.to_lowercase());
            }
        }
        false
    }

    // =========================================================================
    // 4. Safe Official Uninstaller Execution
    // =========================================================================
    pub fn launch_official_uninstaller(software: &SoftwareRecord) -> UninstallLaunchResult {
        let (exe, args, kind) = Self::parse_uninstall_command(
            software
                .uninstall_command
                .as_deref()
                .unwrap_or_default(),
        );

        if kind == "none" || exe.is_empty() {
            return UninstallLaunchResult {
                success: false,
                process_id: None,
                message: "未找到该软件的有效官方卸载命令".to_string(),
            };
        }

        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new(&exe);
            cmd.args(&args);

            match cmd.spawn() {
                Ok(child) => {
                    let pid = child.id();
                    let _ = Self::log_audit(
                        &software.display_name,
                        "LAUNCH_OFFICIAL_UNINSTALLER",
                        &format!("PID: {}, Executable: {}, Args: {:?}", pid, exe, args),
                    );
                    UninstallLaunchResult {
                        success: true,
                        process_id: Some(pid),
                        message: format!("已成功启动官方卸载程序 (PID: {})", pid),
                    }
                }
                Err(e) => UninstallLaunchResult {
                    success: false,
                    process_id: None,
                    message: format!("启动卸载程序失败：{}", e),
                },
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            UninstallLaunchResult {
                success: true,
                process_id: Some(1234),
                message: format!("模拟启动卸载程序：{} {:?}", exe, args),
            }
        }
    }

    // =========================================================================
    // 5. Backend Leftovers Detection & Candidate Registry (P0 Authorization)
    // =========================================================================
    pub fn detect_leftovers(software: &SoftwareRecord) -> Vec<LeftoverCandidate> {
        let mut candidates: Vec<LeftoverCandidate> = Vec::new();
        let app_name = software.display_name.trim();
        let publisher = software.publisher.as_deref().unwrap_or("").trim();

        // A. Inspect registered InstallLocation
        if let Some(ref loc) = software.install_location {
            let loc_clean = PathPolicy::normalize(Path::new(loc));
            if !loc_clean.is_empty() {
                let loc_path = Path::new(&loc_clean);
                if loc_path.exists() {
                    let is_prot = Self::is_path_protected(loc_path);
                    let size = Self::calculate_shallow_size(loc_path);
                    candidates.push(LeftoverCandidate {
                        id: Uuid::new_v4().to_string(),
                        item_type: if loc_path.is_dir() {
                            LeftoverItemType::Directory
                        } else {
                            LeftoverItemType::File
                        },
                        path: loc_clean.to_string(),
                        size_bytes: size,
                        confidence: LeftoverConfidence::High,
                        risk: if is_prot {
                            LeftoverRisk::Protected
                        } else {
                            LeftoverRisk::SafeToReview
                        },
                        reason: "匹配注册表记录的官方完整安装目录 (Matches registered install location)".to_string(),
                        is_protected: is_prot,
                        recommended_selected: !is_prot,
                    });
                }
            }
        }

        // B. Inspect AppData & LocalAppData
        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                Self::inspect_appdata_vendor_folder(&appdata, publisher, app_name, &mut candidates);
            }
            if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
                Self::inspect_appdata_vendor_folder(&localappdata, publisher, app_name, &mut candidates);
            }
            if let Ok(progdata) = std::env::var("PROGRAMDATA") {
                Self::inspect_appdata_vendor_folder(&progdata, publisher, app_name, &mut candidates);
            }
        }

        // C. Inspect Shortcuts (Start Menu & Desktop)
        #[cfg(target_os = "windows")]
        {
            Self::inspect_shortcuts(app_name, &mut candidates);
        }

        // D. Inspect Registry Uninstall Subkey
        #[cfg(target_os = "windows")]
        {
            if let Some(ref subkey_name) = software.registry_key {
                Self::inspect_registry_leftover(subkey_name, &software.source, &mut candidates);
            }
        }

        // Deduplicate candidates by path
        let mut unique_map = HashMap::new();
        for c in candidates {
            let norm_key = c.path.to_lowercase();
            unique_map.entry(norm_key).or_insert(c);
        }

        let mut result: Vec<LeftoverCandidate> = unique_map.into_values().collect();
        // Sort: High confidence first, then safe to review
        result.sort_by(|a, b| {
            let conf_score = |c: &LeftoverConfidence| match c {
                LeftoverConfidence::High => 0,
                LeftoverConfidence::Medium => 1,
                LeftoverConfidence::Low => 2,
                LeftoverConfidence::Unknown => 3,
            };
            conf_score(&a.confidence).cmp(&conf_score(&b.confidence))
        });

        // Register candidates in backend-owned cache
        if let Ok(mut cache_guard) = CANDIDATE_CACHE.lock() {
            let map = cache_guard.get_or_insert_with(HashMap::new);
            for item in &result {
                map.insert(item.id.clone(), item.clone());
            }
        }

        result
    }

    #[cfg(target_os = "windows")]
    fn inspect_appdata_vendor_folder(
        base_dir: &str,
        publisher: &str,
        app_name: &str,
        candidates: &mut Vec<LeftoverCandidate>,
    ) {
        let base_path = Path::new(base_dir);
        if !base_path.exists() {
            return;
        }

        // 1. Check Publisher\AppName
        if !publisher.is_empty() {
            let vendor_app_path = base_path.join(publisher).join(app_name);
            if vendor_app_path.exists() && !Self::is_path_protected(&vendor_app_path) {
                let size = Self::calculate_shallow_size(&vendor_app_path);
                candidates.push(LeftoverCandidate {
                    id: Uuid::new_v4().to_string(),
                    item_type: LeftoverItemType::Directory,
                    path: PathPolicy::normalize(&vendor_app_path),
                    size_bytes: size,
                    confidence: LeftoverConfidence::High,
                    risk: LeftoverRisk::SafeToReview,
                    reason: format!("匹配「{}\\{}」专属应用配置与缓存目录", publisher, app_name),
                    is_protected: false,
                    recommended_selected: true,
                });
            }
        }

        // 2. Check AppName directly in base_dir
        let direct_app_path = base_path.join(app_name);
        if direct_app_path.exists() && !Self::is_path_protected(&direct_app_path) {
            let size = Self::calculate_shallow_size(&direct_app_path);
            candidates.push(LeftoverCandidate {
                id: Uuid::new_v4().to_string(),
                item_type: LeftoverItemType::Directory,
                path: PathPolicy::normalize(&direct_app_path),
                size_bytes: size,
                confidence: LeftoverConfidence::Medium,
                risk: LeftoverRisk::NeedsReview,
                reason: format!("匹配「{}」应用专属配置数据目录（需人工复核）", app_name),
                is_protected: false,
                recommended_selected: false,
            });
        }
    }

    #[cfg(target_os = "windows")]
    fn inspect_shortcuts(app_name: &str, candidates: &mut Vec<LeftoverCandidate>) {
        let clean_app = app_name.to_lowercase();

        // 1. Desktop shortcuts
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let user_desktop = Path::new(&userprofile).join("Desktop");
            Self::scan_folder_for_shortcuts(&user_desktop, &clean_app, "桌面快捷方式", candidates);
        }
        let public_desktop = Path::new(r"C:\Users\Public\Desktop");
        Self::scan_folder_for_shortcuts(public_desktop, &clean_app, "公共桌面快捷方式", candidates);

        // 2. Start Menu shortcuts
        if let Ok(appdata) = std::env::var("APPDATA") {
            let user_start_menu = Path::new(&appdata).join(r"Microsoft\Windows\Start Menu\Programs");
            Self::scan_folder_for_shortcuts(&user_start_menu, &clean_app, "开始菜单启动项", candidates);
        }
        if let Ok(progdata) = std::env::var("PROGRAMDATA") {
            let global_start_menu = Path::new(&progdata).join(r"Microsoft\Windows\Start Menu\Programs");
            Self::scan_folder_for_shortcuts(&global_start_menu, &clean_app, "公共开始菜单启动项", candidates);
        }
    }

    #[cfg(target_os = "windows")]
    fn scan_folder_for_shortcuts(
        folder: &Path,
        clean_app_name: &str,
        label: &str,
        candidates: &mut Vec<LeftoverCandidate>,
    ) {
        if !folder.exists() || !folder.is_dir() {
            return;
        }

        if let Ok(entries) = fs::read_dir(folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "lnk" {
                        if let Some(stem) = path.file_stem() {
                            let stem_str = stem.to_string_lossy().to_lowercase();
                            if stem_str.contains(clean_app_name) {
                                candidates.push(LeftoverCandidate {
                                    id: Uuid::new_v4().to_string(),
                                    item_type: LeftoverItemType::Shortcut,
                                    path: PathPolicy::normalize(&path),
                                    size_bytes: path.metadata().ok().map(|m| m.len()),
                                    confidence: LeftoverConfidence::High,
                                    risk: LeftoverRisk::SafeToReview,
                                    reason: format!("匹配「{}」{}", stem.to_string_lossy(), label),
                                    is_protected: false,
                                    recommended_selected: true,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn inspect_registry_leftover(
        subkey_name: &str,
        source: &str,
        candidates: &mut Vec<LeftoverCandidate>,
    ) {
        let clean_key = subkey_name.trim();
        if clean_key.is_empty() {
            return;
        }

        let base_path = match source {
            "Registry (HKCU)" => format!(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", clean_key),
            "Registry (HKLM 64-bit)" => format!(r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{}", clean_key),
            "Registry (HKLM 32-bit)" => format!(r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{}", clean_key),
            _ => format!(r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{}", clean_key),
        };

        candidates.push(LeftoverCandidate {
            id: Uuid::new_v4().to_string(),
            item_type: LeftoverItemType::RegistryKey,
            path: base_path,
            size_bytes: None,
            confidence: LeftoverConfidence::High,
            risk: LeftoverRisk::SafeToReview,
            reason: "卸载后残留的 Windows 软件注册表登记项 (Orphaned Uninstall Registry Entry)".to_string(),
            is_protected: false,
            recommended_selected: true,
        });
    }

    fn calculate_shallow_size(path: &Path) -> Option<u64> {
        if path.is_file() {
            return path.metadata().ok().map(|m| m.len());
        }
        if path.is_dir() {
            let mut total: u64 = 0;
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten().take(500) {
                    if let Ok(meta) = entry.metadata() {
                        total += meta.len();
                    }
                }
            }
            return Some(total);
        }
        None
    }

    // =========================================================================
    // 6. Safe Cleanup Execution with Dry-Run, P0 Authorization & Re-verification
    // =========================================================================
    pub fn execute_cleanup(plan: CleanupPlan) -> CleanupExecutionReport {
        let mut results: Vec<CleanupItemResult> = Vec::new();
        let mut removed_count = 0;
        let mut skipped_count = 0;
        let mut failed_count = 0;

        let cache_snapshot = {
            let guard = CANDIDATE_CACHE.lock().ok();
            guard.and_then(|g| g.clone()).unwrap_or_default()
        };

        for item in &plan.items {
            // P0 Requirement: Verify candidate ID is registered in backend cache
            let registered_candidate = match cache_snapshot.get(&item.id) {
                Some(c) => c,
                None => {
                    // Unauthorized / forged candidate ID
                    skipped_count += 1;
                    results.push(CleanupItemResult {
                        candidate_id: item.id.clone(),
                        path: item.path.clone(),
                        success: false,
                        status: "skipped_unauthorized".to_string(),
                        message: "未通过后端安全令牌授权校验（非法或未授权的 Candidate ID）".to_string(),
                    });
                    continue;
                }
            };

            // P0 Requirement: Verify candidate path and item_type match backend evidence exactly
            let normalized_req_path = PathPolicy::normalize(Path::new(&item.path));
            let normalized_reg_path = PathPolicy::normalize(Path::new(&registered_candidate.path));

            if normalized_req_path.to_lowercase() != normalized_reg_path.to_lowercase()
                || item.item_type != registered_candidate.item_type
            {
                skipped_count += 1;
                results.push(CleanupItemResult {
                    candidate_id: item.id.clone(),
                    path: item.path.clone(),
                    success: false,
                    status: "skipped_tampered".to_string(),
                    message: "路径或项目类型与后端登记的 Candidate 证据不一致，已拦截".to_string(),
                });
                continue;
            }

            // Re-validate protection policy immediately before deletion
            let path_obj = Path::new(&item.path);

            if item.item_type != LeftoverItemType::RegistryKey && Self::is_path_protected(path_obj) {
                skipped_count += 1;
                results.push(CleanupItemResult {
                    candidate_id: item.id.clone(),
                    path: item.path.clone(),
                    success: false,
                    status: "skipped_protected".to_string(),
                    message: "该路径属于 Windows 系统保护目录，已安全拦截跳过".to_string(),
                });
                continue;
            }

            if plan.is_dry_run {
                // Dry run mode: purely simulated verification
                results.push(CleanupItemResult {
                    candidate_id: item.id.clone(),
                    path: item.path.clone(),
                    success: true,
                    status: "dry_run_simulated".to_string(),
                    message: "试运行模式：已验证路径与安全授权，未执行实际删除".to_string(),
                });
                continue;
            }

            // Real deletion execution
            match item.item_type {
                LeftoverItemType::Directory => {
                    if !path_obj.exists() {
                        skipped_count += 1;
                        results.push(CleanupItemResult {
                            candidate_id: item.id.clone(),
                            path: item.path.clone(),
                            success: true,
                            status: "skipped_not_found".to_string(),
                            message: "目标目录已不存在或已被官方卸载程序移除".to_string(),
                        });
                    } else {
                        // Check if symlink or reparse point to prevent recursion attacks
                        if let Ok(meta) = fs::symlink_metadata(path_obj) {
                            if meta.file_type().is_symlink() {
                                skipped_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: false,
                                    status: "skipped_symlink".to_string(),
                                    message: "检测到符号链接/重解析点，为防止意外误删已安全跳过".to_string(),
                                });
                                continue;
                            }
                        }

                        match fs::remove_dir_all(path_obj) {
                            Ok(_) => {
                                removed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: true,
                                    status: "removed".to_string(),
                                    message: "已安全清理残留目录".to_string(),
                                });
                            }
                            Err(e) => {
                                failed_count += 1;
                                let is_in_use = e.to_string().contains("Access is denied")
                                    || e.to_string().contains("in use")
                                    || e.kind() == std::io::ErrorKind::PermissionDenied;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: false,
                                    status: if is_in_use {
                                        "skipped_in_use".to_string()
                                    } else {
                                        "failed".to_string()
                                    },
                                    message: format!("清理目录失败：{}", e),
                                });
                            }
                        }
                    }
                }
                LeftoverItemType::File | LeftoverItemType::Shortcut => {
                    if !path_obj.exists() {
                        skipped_count += 1;
                        results.push(CleanupItemResult {
                            candidate_id: item.id.clone(),
                            path: item.path.clone(),
                            success: true,
                            status: "skipped_not_found".to_string(),
                            message: "目标文件已不存在".to_string(),
                        });
                    } else {
                        match fs::remove_file(path_obj) {
                            Ok(_) => {
                                removed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: true,
                                    status: "removed".to_string(),
                                    message: "已安全清理残留文件/快捷方式".to_string(),
                                });
                            }
                            Err(e) => {
                                failed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: false,
                                    status: "failed".to_string(),
                                    message: format!("清理文件失败：{}", e),
                                });
                            }
                        }
                    }
                }
                LeftoverItemType::RegistryKey => {
                    #[cfg(target_os = "windows")]
                    {
                        // 1. First backup registry key
                        let backup_res = Self::backup_registry_key_safe(&item.path);
                        if let Err(err) = backup_res {
                            skipped_count += 1;
                            results.push(CleanupItemResult {
                                candidate_id: item.id.clone(),
                                path: item.path.clone(),
                                success: false,
                                status: "skipped_backup_failed".to_string(),
                                message: format!("注册表自动备份失败，为确保安全已跳过删除：{}", err),
                            });
                            continue;
                        }

                        // 2. Delete registry key safely
                        let reg_res = Self::delete_registry_key_safe(&item.path);
                        match reg_res {
                            Ok(_) => {
                                removed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: true,
                                    status: "removed".to_string(),
                                    message: "已安全备份并清理残留注册表卸载项".to_string(),
                                });
                            }
                            Err(e) => {
                                failed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: false,
                                    status: "failed".to_string(),
                                    message: format!("注册表清理失败：{}", e),
                                });
                            }
                        }
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        skipped_count += 1;
                        results.push(CleanupItemResult {
                            candidate_id: item.id.clone(),
                            path: item.path.clone(),
                            success: true,
                            status: "dry_run_simulated".to_string(),
                            message: "非 Windows 环境注册表跳过".to_string(),
                        });
                    }
                }
            }
        }

        // Record Audit Log
        let _ = Self::log_audit(
            &plan.software_name,
            if plan.is_dry_run { "CLEANUP_DRY_RUN" } else { "CLEANUP_EXECUTION" },
            &format!(
                "Total: {}, Removed: {}, Skipped: {}, Failed: {}",
                plan.items.len(),
                removed_count,
                skipped_count,
                failed_count
            ),
        );

        CleanupExecutionReport {
            software_name: plan.software_name,
            total_candidates: plan.items.len(),
            removed_count,
            skipped_count,
            failed_count,
            results,
            is_dry_run: plan.is_dry_run,
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }

    #[cfg(target_os = "windows")]
    fn backup_registry_key_safe(full_path: &str) -> Result<PathBuf, String> {
        let backup_dir = crate::get_portable_data_dir().join("backups").join("registry");
        let _ = fs::create_dir_all(&backup_dir);
        let safe_name = full_path.replace('\\', "_").replace(':', "_");
        let backup_file = backup_dir.join(format!("{}_{}.reg", safe_name, Local::now().format("%Y%m%d_%H%M%S")));

        let status = Command::new("reg")
            .args(["export", full_path, backup_file.to_str().unwrap_or(""), "/y"])
            .status();

        match status {
            Ok(s) if s.success() => Ok(backup_file),
            Ok(s) => Err(format!("reg export 退出码异常: {:?}", s.code())),
            Err(e) => Err(format!("启动 reg export 失败: {}", e)),
        }
    }

    #[cfg(target_os = "windows")]
    fn delete_registry_key_safe(full_path: &str) -> Result<(), String> {
        let (hive_type, subkey_path) = if full_path.starts_with("HKCU\\") {
            (HKEY_CURRENT_USER, &full_path[5..])
        } else if full_path.starts_with("HKLM\\") {
            (HKEY_LOCAL_MACHINE, &full_path[5..])
        } else {
            return Err("未知注册表根项 (Unknown hive)".to_string());
        };

        if let Some(last_slash) = subkey_path.rfind('\\') {
            let parent_path = &subkey_path[..last_slash];
            let target_sub_name = &subkey_path[last_slash + 1..];

            let parent_key = RegKey::predef(hive_type)
                .open_subkey_with_flags(parent_path, KEY_ALL_ACCESS)
                .map_err(|e| format!("打开注册表父键失败：{}", e))?;

            parent_key
                .delete_subkey_all(target_sub_name)
                .map_err(|e| format!("删除注册表子项失败：{}", e))?;

            Ok(())
        } else {
            Err("无效的注册表子项路径 (Invalid registry subkey)".to_string())
        }
    }

    // =========================================================================
    // 7. Local Audit Log Management
    // =========================================================================
    pub fn log_audit(software_name: &str, action: &str, details: &str) -> Result<(), String> {
        let entry = AuditLogEntry {
            id: Uuid::new_v4().to_string(),
            software_name: software_name.to_string(),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            action: action.to_string(),
            details: details.to_string(),
        };

        let log_dir = crate::get_portable_data_dir().join("logs");
        let _ = fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("uninstall_audit.jsonl");

        if let Ok(json_line) = serde_json::to_string(&entry) {
            use std::io::Write;
            if let Ok(mut file) = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_file)
            {
                let _ = writeln!(file, "{}", json_line);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_path_protection() {
        assert!(UninstallManager::is_path_protected(Path::new("C:\\")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Windows")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Windows\\System32")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Program Files")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Program Files (x86)")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\ProgramData")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Users")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Users\\Administrator")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Users\\Alice\\AppData")));
        assert!(UninstallManager::is_path_protected(Path::new("C:\\Users\\Alice\\AppData\\Local")));

        // Valid deep subdirectories MUST NOT be protected
        assert!(!UninstallManager::is_path_protected(Path::new(
            "C:\\Program Files\\MyVendor\\MyCoolApp"
        )));
        assert!(!UninstallManager::is_path_protected(Path::new(
            "C:\\Users\\Alice\\AppData\\Local\\MyVendor\\MyCoolApp"
        )));
        assert!(!UninstallManager::is_path_protected(Path::new(
            "C:\\WindowsBackup"
        )));
    }

    #[test]
    fn test_parse_msi_command() {
        let cmd = "MsiExec.exe /I{73F28562-4C61-4694-9134-29E53CA10F20}";
        let (exe, args, kind) = UninstallManager::parse_uninstall_command(cmd);
        assert_eq!(exe, "msiexec.exe");
        assert_eq!(args, vec!["/x", "{73F28562-4C61-4694-9134-29E53CA10F20}"]);
        assert_eq!(kind, "msi");
    }

    #[test]
    fn test_parse_quoted_exe_command() {
        let cmd = r#""C:\Program Files\Git\unins000.exe" /SILENT /NORESTART"#;
        let (exe, args, kind) = UninstallManager::parse_uninstall_command(cmd);
        assert_eq!(exe, r"C:\Program Files\Git\unins000.exe");
        assert_eq!(args, vec!["/SILENT", "/NORESTART"]);
        assert_eq!(kind, "exe");
    }

    #[test]
    fn test_arbitrary_frontend_path_rejected() {
        // Test that an arbitrary path injected by frontend with a fake candidate ID is rejected
        let fake_candidate = LeftoverCandidate {
            id: "fake-arbitrary-uuid".to_string(),
            item_type: LeftoverItemType::Directory,
            path: r"C:\Windows\System32".to_string(),
            size_bytes: Some(1024),
            confidence: LeftoverConfidence::High,
            risk: LeftoverRisk::SafeToReview,
            reason: "Maliciously injected candidate".to_string(),
            is_protected: false,
            recommended_selected: true,
        };

        let plan = CleanupPlan {
            software_id: "soft-test".to_string(),
            software_name: "EvilApp".to_string(),
            items: vec![fake_candidate],
            is_dry_run: false,
        };

        let report = UninstallManager::execute_cleanup(plan);
        assert_eq!(report.total_candidates, 1);
        assert_eq!(report.removed_count, 0);
        assert_eq!(report.skipped_count, 1);
        assert_eq!(report.results[0].status, "skipped_unauthorized");
        assert!(!report.results[0].success);
    }
}
