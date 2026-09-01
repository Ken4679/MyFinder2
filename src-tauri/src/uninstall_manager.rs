use crate::models::{
    LeftoverCandidate, LeftoverConfidence, LeftoverItemType, LeftoverRisk,
    SoftwareRecord, UninstallPrecheckInfo,
};
use crate::path_policy::PathPolicy;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;
use uuid::Uuid;

pub struct UninstallManager;

impl UninstallManager {
    // =========================================================================
    // 1. Centralized System Path Protection Policy (Delegate to PathPolicy)
    // =========================================================================
    pub fn is_path_protected(path: &Path) -> bool {
        PathPolicy::is_protected(path)
    }

    // =========================================================================
    // 2. Safe Uninstall Command Parsing (Read-Only metadata inspection)
    // =========================================================================
    pub fn parse_uninstall_command(raw_cmd: &str) -> (String, Vec<String>, String) {
        let trimmed = raw_cmd.trim();
        if trimmed.is_empty() {
            return (String::new(), Vec::new(), "none".to_string());
        }

        let lower = trimmed.to_lowercase();

        // 1. MSI command detection (e.g. MsiExec.exe /I{...} or msiexec /x{...})
        if lower.contains("msiexec") || lower.contains("msi.dll") {
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
    // 3. Uninstall & Software Details Pre-check (Read-Only Inspection)
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
        let _ = process_name;
        false
    }

    // =========================================================================
    // 4. Backend Residual & Related Files Detection (Strictly Read-Only Analysis)
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
            reason: "Windows 软件注册表卸载登记项 (Uninstall Registry Entry)".to_string(),
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
}

