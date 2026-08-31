use crate::models::{
    AuditLogEntry, CleanupExecutionReport, CleanupItemResult, CleanupPlan, LeftoverCandidate,
    LeftoverConfidence, LeftoverItemType, LeftoverRisk, SoftwareRecord, UninstallLaunchResult,
    UninstallPrecheckInfo,
};
use chrono::Local;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
#[cfg(target_os = "windows")]
use winreg::RegKey;

pub struct UninstallManager;

impl UninstallManager {
    // =========================================================================
    // 1. Centralized System Path Protection Policy
    // =========================================================================
    pub fn is_path_protected(path: &Path) -> bool {
        let path_str = path.to_string_lossy().to_lowercase();
        let clean = path_str.trim().trim_matches('"').trim_matches('\'').replace('/', "\\");
        let parts: Vec<&str> = clean
            .split('\\')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && *s != ".")
            .collect();

        // 1. Empty or single root component (e.g. "C:", "C:\", "D:\", "\\server\share")
        if parts.is_empty() || parts.len() == 1 {
            return true;
        }

        let first = parts[0];
        let second = parts.get(1).copied().unwrap_or("");

        // If path is root or immediate subfolder of drive (parts.len() <= 2)
        if parts.len() <= 2 {
            // e.g. "C:\Windows", "C:\Users", "C:\ProgramData", "C:\Recovery"
            return true;
        }

        // 2. Multi-drive Windows System Directories protection
        // For ANY drive letter X:\ or relative path
        if second == "windows" {
            // Protected: X:\Windows, X:\Windows\System32, X:\Windows\System, X:\Windows\SysWOW64, X:\Windows\WinSxS, etc.
            return true;
        }
        if second == "system32"
            || second == "syswow64"
            || second == "winsxs"
            || second == "recovery"
            || second == "$recycle.bin"
            || second == "system volume information"
            || second == "boot"
            || second == "msocache"
        {
            return true;
        }

        // 3. Program Files & ProgramData roots protection:
        if (second == "program files" || second == "program files (x86)" || second == "programdata") {
            if parts.len() <= 2 {
                return true;
            }
            let third = parts.get(2).copied().unwrap_or("");
            if third == "common files" || third == "microsoft" || third == "windows" {
                return true;
            }
        }

        // 4. Users / User Profile Roots protection (any drive):
        if second == "users" {
            // parts: ["c:", "users", "username", "appdata", "local", ...]
            if parts.len() <= 3 {
                // e.g. C:\Users, C:\Users\Username
                return true;
            }
            let fourth = parts.get(3).copied().unwrap_or("");
            if parts.len() == 4
                && (fourth == "appdata"
                    || fourth == "desktop"
                    || fourth == "documents"
                    || fourth == "downloads"
                    || fourth == "pictures"
                    || fourth == "videos"
                    || fourth == "music")
            {
                // e.g. C:\Users\Username\AppData, C:\Users\Username\Desktop
                return true;
            }
            if parts.len() == 5 && fourth == "appdata" {
                let fifth = parts.get(4).copied().unwrap_or("");
                if fifth == "local"
                    || fifth == "roaming"
                    || fifth == "locallow"
                    || fifth == "microsoft"
                    || fifth == "temp"
                {
                    // e.g. C:\Users\Username\AppData\Local
                    return true;
                }
            }
        }

        false
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
                vec!["/x".to_string()],
                "msi".to_string(),
            );
        }

        // 2. Quoted executable path parsing, e.g. "C:\Program Files\App\unins000.exe" /arg1 /arg2
        if trimmed.starts_with('"') {
            if let Some(second_quote) = trimmed[1..].find('"') {
                let exe_path = &trimmed[1..=second_quote];
                let remainder = &trimmed[second_quote + 2..].trim();
                let args = if !remainder.is_empty() {
                    remainder.split_whitespace().map(|s| s.to_string()).collect()
                } else {
                    Vec::new()
                };
                return (exe_path.to_string(), args, "exe".to_string());
            }
        }

        // 3. Unquoted path parsing: Check if .exe is present
        if let Some(idx) = lower.find(".exe") {
            let exe_part = &trimmed[..idx + 4];
            let remainder = trimmed[idx + 4..].trim();
            let args = if !remainder.is_empty() {
                remainder.split_whitespace().map(|s| s.to_string()).collect()
            } else {
                Vec::new()
            };
            return (exe_part.to_string(), args, "exe".to_string());
        }

        (trimmed.to_string(), Vec::new(), "exe".to_string())
    }

    // =========================================================================
    // 3. Pre-uninstall Safety Checks
    // =========================================================================
    pub fn precheck_uninstall(software: &SoftwareRecord) -> UninstallPrecheckInfo {
        let raw_cmd = software.uninstall_command.as_deref().unwrap_or("");
        let (exe_path, _args, uninstaller_type) = Self::parse_uninstall_command(raw_cmd);

        let uninstaller_exists = if uninstaller_type == "msi" {
            true // msiexec is a Windows system binary
        } else if !exe_path.is_empty() {
            Path::new(&exe_path).exists()
        } else {
            false
        };

        // Check if main executable or uninstaller appears in running processes
        let is_running = Self::check_is_process_running(software);

        UninstallPrecheckInfo {
            software_id: software.id.clone(),
            software_name: software.display_name.clone(),
            publisher: software.publisher.clone(),
            version: software.version.clone(),
            install_location: software.install_location.clone(),
            uninstaller_type,
            uninstaller_path: if exe_path.is_empty() { None } else { Some(exe_path) },
            uninstaller_exists,
            uninstall_command: software.uninstall_command.clone(),
            is_running,
        }
    }

    fn check_is_process_running(software: &SoftwareRecord) -> bool {
        // Quick local process check on Windows
        if let Some(ref main_exe) = software.main_exe_path {
            if let Some(file_name) = Path::new(main_exe).file_name().and_then(|f| f.to_str()) {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(output) = Command::new("tasklist")
                        .args(["/FI", &format!("IMAGENAME eq {}", file_name), "/NH"])
                        .output()
                    {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        if stdout.to_lowercase().contains(&file_name.to_lowercase()) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    // =========================================================================
    // 4. Safe Official Uninstaller Execution
    // =========================================================================
    pub fn launch_official_uninstaller(software: &SoftwareRecord) -> Result<UninstallLaunchResult, String> {
        let raw_cmd = software
            .uninstall_command
            .as_deref()
            .ok_or_else(|| "此软件未在注册表中登记任何卸载命令 (No registered uninstall command)".to_string())?;

        let (exe_path, args, uninstaller_type) = Self::parse_uninstall_command(raw_cmd);

        if uninstaller_type == "none" || exe_path.is_empty() {
            return Err("未找到有效的卸载程序路径 (Invalid uninstaller path)".to_string());
        }

        if uninstaller_type == "exe" && !Path::new(&exe_path).exists() {
            return Err(format!(
                "官方卸载程序未在磁盘上找到：{}。请检查该软件是否已被手动删除。",
                exe_path
            ));
        }

        // Spawn process directly without cmd.exe shell wrapper
        let mut cmd = Command::new(&exe_path);
        cmd.args(&args);

        // If install location exists, set it as working directory for safety
        if let Some(ref loc) = software.install_location {
            let loc_path = Path::new(loc);
            if loc_path.exists() && loc_path.is_dir() {
                cmd.current_dir(loc_path);
            }
        }

        match cmd.spawn() {
            Ok(child) => {
                let pid = child.id();
                // Record audit log
                let _ = Self::log_audit(
                    &software.display_name,
                    "LAUNCH_UNINSTALLER",
                    &format!("Launched official uninstaller PID: {}, Exe: {}, Args: {:?}", pid, exe_path, args),
                );

                Ok(UninstallLaunchResult {
                    success: true,
                    process_id: Some(pid),
                    message: format!("已成功拉起「{}」的官方卸载向导 (PID: {})", software.display_name, pid),
                })
            }
            Err(e) => Err(format!("拉起官方卸载程序失败：{}", e)),
        }
    }

    // =========================================================================
    // 5. Multi-Signal Leftover Detection Engine
    // =========================================================================
    pub fn detect_leftovers(software: &SoftwareRecord) -> Vec<LeftoverCandidate> {
        let mut candidates: Vec<LeftoverCandidate> = Vec::new();
        let app_name = software.display_name.trim();
        let publisher = software.publisher.as_deref().unwrap_or("").trim();

        // A. Inspect Installation Directory
        if let Some(ref loc) = software.install_location {
            let loc_clean = loc.trim().trim_matches('"').trim_matches('\'').trim();
            if !loc_clean.is_empty() {
                let path = Path::new(loc_clean);
                if path.exists() {
                    let is_prot = Self::is_path_protected(path);
                    let size = Self::calculate_shallow_size(path);
                    candidates.push(LeftoverCandidate {
                        id: Uuid::new_v4().to_string(),
                        item_type: if path.is_dir() {
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
        let mut unique_map = std::collections::HashMap::new();
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
                    path: vendor_app_path.to_string_lossy().to_string(),
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
                path: direct_app_path.to_string_lossy().to_string(),
                size_bytes: size,
                confidence: LeftoverConfidence::Medium,
                risk: LeftoverRisk::NeedsReview,
                reason: format!("匹配「{}」应用专属配置数据目录（需人工复核）", app_name),
                is_protected: false,
                recommended_selected: false, // Medium confidence -> requires explicit manual user review
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
                let p = entry.path();
                let fname = p.file_name().and_then(|f| f.to_str()).unwrap_or("").to_lowercase();
                if (fname.ends_with(".lnk") || fname.ends_with(".url")) && fname.contains(clean_app_name) {
                    candidates.push(LeftoverCandidate {
                        id: Uuid::new_v4().to_string(),
                        item_type: LeftoverItemType::Shortcut,
                        path: p.to_string_lossy().to_string(),
                        size_bytes: entry.metadata().ok().map(|m| m.len()),
                        confidence: LeftoverConfidence::High,
                        risk: LeftoverRisk::SafeToReview,
                        reason: format!("匹配「{}」的 {}", clean_app_name, label),
                        is_protected: false,
                        recommended_selected: true,
                    });
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
        let hive_type = if source.contains("HKCU") {
            HKEY_CURRENT_USER
        } else {
            HKEY_LOCAL_MACHINE
        };

        let base_path = if source.contains("32-bit") {
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        } else {
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
        };

        let full_reg_path = format!("{}\\{}", base_path, subkey_name);

        if let Ok(root_key) = RegKey::predef(hive_type).open_subkey_with_flags(base_path, KEY_READ) {
            if let Ok(_) = root_key.open_subkey_with_flags(subkey_name, KEY_READ) {
                candidates.push(LeftoverCandidate {
                    id: Uuid::new_v4().to_string(),
                    item_type: LeftoverItemType::RegistryKey,
                    path: format!("{}\\{}", if hive_type == HKEY_CURRENT_USER { "HKCU" } else { "HKLM" }, full_reg_path),
                    size_bytes: None,
                    confidence: LeftoverConfidence::High,
                    risk: LeftoverRisk::SafeToReview,
                    reason: "卸载后残留的 Windows 软件注册表登记项 (Orphaned Uninstall Registry Entry)".to_string(),
                    is_protected: false,
                    recommended_selected: true,
                });
            }
        }
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
    // 6. Safe Cleanup Execution with Dry-Run & Atomic Re-verification
    // =========================================================================
    pub fn execute_cleanup(plan: CleanupPlan) -> CleanupExecutionReport {
        let mut results: Vec<CleanupItemResult> = Vec::new();
        let mut removed_count = 0;
        let mut skipped_count = 0;
        let mut failed_count = 0;

        for item in &plan.items {
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
                    message: "试运行模式：已验证路径与安全权限，未执行实际删除".to_string(),
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
                        // Check if symlink
                        if let Ok(meta) = fs::symlink_metadata(path_obj) {
                            if meta.file_type().is_symlink() {
                                skipped_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: false,
                                    status: "skipped_protected".to_string(),
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
                        let reg_res = Self::delete_registry_key_safe(&item.path);
                        match reg_res {
                            Ok(_) => {
                                removed_count += 1;
                                results.push(CleanupItemResult {
                                    candidate_id: item.id.clone(),
                                    path: item.path.clone(),
                                    success: true,
                                    status: "removed".to_string(),
                                    message: "已安全清理残留注册表卸载项".to_string(),
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
    fn test_dry_run_execution() {
        let candidate = LeftoverCandidate {
            id: "cand-1".to_string(),
            item_type: LeftoverItemType::Directory,
            path: r"C:\Program Files\TestVendor\TestApp".to_string(),
            size_bytes: Some(1024),
            confidence: LeftoverConfidence::High,
            risk: LeftoverRisk::SafeToReview,
            reason: "Matches recorded install location".to_string(),
            is_protected: false,
            recommended_selected: true,
        };

        let plan = CleanupPlan {
            software_id: "soft-1".to_string(),
            software_name: "TestApp".to_string(),
            items: vec![candidate],
            is_dry_run: true,
        };

        let report = UninstallManager::execute_cleanup(plan);
        assert_eq!(report.total_candidates, 1);
        assert_eq!(report.results.len(), 1);
        assert_eq!(report.results[0].status, "dry_run_simulated");
        assert!(report.results[0].success);
    }
}
