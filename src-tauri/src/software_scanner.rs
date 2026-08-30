use crate::models::SoftwareRecord;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

pub struct SoftwareScanner;

#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
#[cfg(target_os = "windows")]
use winreg::RegKey;

impl SoftwareScanner {
    pub fn scan_all() -> Result<Vec<SoftwareRecord>, String> {
        let mut raw_records: Vec<SoftwareRecord> = Vec::new();

        #[cfg(target_os = "windows")]
        {
            // 1. Machine-wide 64-bit uninstall registry
            if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ | KEY_WOW64_64KEY,
            ) {
                Self::enumerate_registry_hive(&hklm, "HKLM (64-bit)", Some("x64"), &mut raw_records);
            }

            // 2. Machine-wide 32-bit (WOW6432Node) uninstall registry
            if let Ok(hklm_32) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ | KEY_WOW64_32KEY,
            ) {
                Self::enumerate_registry_hive(&hklm_32, "HKLM (32-bit/WOW64)", Some("x86"), &mut raw_records);
            }

            // 3. Per-user uninstall registry (HKCU)
            if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ,
            ) {
                Self::enumerate_registry_hive(&hkcu, "HKCU (User)", None, &mut raw_records);
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Fallback for non-Windows build environments (Linux dev/CI)
            raw_records = Vec::new();
        }

        // Deduplicate and sort
        let deduped = Self::deduplicate_records(raw_records);
        Ok(deduped)
    }

    #[cfg(target_os = "windows")]
    fn enumerate_registry_hive(
        parent_key: &RegKey,
        source_label: &str,
        default_arch: Option<&str>,
        records: &mut Vec<SoftwareRecord>,
    ) {
        for subkey_name in parent_key.enum_keys().filter_map(|k| k.ok()) {
            let subkey = match parent_key.open_subkey_with_flags(&subkey_name, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue, // Skip inaccessible keys safely
            };

            // DisplayName check: required for legitimate installed applications
            let display_name_raw: Result<String, _> = subkey.get_value("DisplayName");
            let display_name = match display_name_raw {
                Ok(name) => {
                    let trimmed = name.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    trimmed
                }
                Err(_) => continue, // Skip entries without DisplayName
            };

            // Skip internal system components if explicitly marked SystemComponent = 1
            if let Ok(sys_comp) = subkey.get_value::<u32, _>("SystemComponent") {
                if sys_comp == 1 {
                    continue;
                }
            }

            // Skip sub-patches/updates if ParentKeyName is present
            if let Ok(parent_pkg) = subkey.get_value::<String, _>("ParentKeyName") {
                if !parent_pkg.trim().is_empty() {
                    continue;
                }
            }

            let publisher = Self::get_normalized_string(&subkey, "Publisher");
            let version = Self::get_normalized_string(&subkey, "DisplayVersion");
            let install_location = Self::get_normalized_path(&subkey, "InstallLocation");
            let install_date = Self::get_normalized_date(&subkey, "InstallDate");
            let uninstall_command = Self::get_normalized_string(&subkey, "UninstallString");
            let quiet_uninstall_command = Self::get_normalized_string(&subkey, "QuietUninstallString");
            let display_icon = Self::get_normalized_icon(&subkey, "DisplayIcon");

            // EstimatedSize is stored as DWORD in KB in Windows Registry
            let estimated_size = subkey
                .get_value::<u32, _>("EstimatedSize")
                .ok()
                .map(|kb| (kb as u64) * 1024);

            // Infer main executable path if possible from DisplayIcon or InstallLocation
            let main_exe_path = Self::resolve_main_exe(&install_location, &display_icon);

            let architecture = default_arch.map(|s| s.to_string());

            let record = SoftwareRecord {
                id: Uuid::new_v4().to_string(),
                display_name,
                publisher,
                version,
                install_location,
                install_date,
                architecture,
                uninstall_command,
                quiet_uninstall_command,
                estimated_size,
                source: source_label.to_string(),
                registry_key: Some(subkey_name),
                package_family: None,
                display_icon,
                main_exe_path,
                is_signed: None,
                signer_name: None,
            };

            records.push(record);
        }
    }

    #[cfg(target_os = "windows")]
    fn get_normalized_string(key: &RegKey, value_name: &str) -> Option<String> {
        key.get_value::<String, _>(value_name).ok().and_then(|val| {
            let trimmed = val.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
    }

    #[cfg(target_os = "windows")]
    fn get_normalized_path(key: &RegKey, value_name: &str) -> Option<String> {
        Self::get_normalized_string(key, value_name).map(|p| {
            let clean = p.trim().trim_matches('"').trim_matches('\'').trim();
            clean.replace('/', "\\")
        })
    }

    #[cfg(target_os = "windows")]
    fn get_normalized_date(key: &RegKey, value_name: &str) -> Option<String> {
        if let Some(date_str) = Self::get_normalized_string(key, value_name) {
            // Check for YYYYMMDD 8-digit format
            if date_str.len() == 8 && date_str.chars().all(|c| c.is_ascii_digit()) {
                let y = &date_str[0..4];
                let m = &date_str[4..6];
                let d = &date_str[6..8];
                return Some(format!("{}-{}-{}", y, m, d));
            }
            return Some(date_str);
        }
        None
    }

    #[cfg(target_os = "windows")]
    fn get_normalized_icon(key: &RegKey, value_name: &str) -> Option<String> {
        Self::get_normalized_string(key, value_name).map(|raw| {
            let trimmed = raw.trim().trim_matches('"');
            // Remove trailing icon index like ",0" or ",-1" if present
            if let Some(idx) = trimmed.rfind(',') {
                let suffix = &trimmed[idx + 1..];
                if suffix.chars().all(|c| c.is_ascii_digit() || c == '-') {
                    return trimmed[..idx].trim().trim_matches('"').to_string();
                }
            }
            trimmed.to_string()
        })
    }

    pub fn resolve_main_exe(
        install_location: &Option<String>,
        display_icon: &Option<String>,
    ) -> Option<String> {
        // 1. Check DisplayIcon if it points to a .exe
        if let Some(ref icon) = display_icon {
            let clean = icon.trim().trim_matches('"').trim();
            if clean.to_lowercase().ends_with(".exe") {
                return Some(clean.to_string());
            }
        }

        // 2. Check InstallLocation
        if let Some(ref loc) = install_location {
            let clean_loc = loc.trim().trim_matches('"').trim();
            if clean_loc.to_lowercase().ends_with(".exe") {
                return Some(clean_loc.to_string());
            }
        }

        None
    }

    pub fn deduplicate_records(records: Vec<SoftwareRecord>) -> Vec<SoftwareRecord> {
        let mut map: HashMap<String, SoftwareRecord> = HashMap::new();

        for record in records {
            // Composite key: (normalized display name, version, publisher)
            let norm_name = record.display_name.trim().to_lowercase();
            let norm_ver = record
                .version
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let norm_pub = record
                .publisher
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_lowercase();

            let dedup_key = format!("{}|{}|{}", norm_name, norm_ver, norm_pub);

            if let Some(existing) = map.get_mut(&dedup_key) {
                // If existing is 32-bit and new is 64-bit, prefer 64-bit
                if existing.architecture.as_deref() == Some("x86")
                    && record.architecture.as_deref() == Some("x64")
                {
                    *existing = record;
                } else {
                    // Enrich existing record with any missing fields from the duplicate
                    if existing.install_location.is_none() && record.install_location.is_some() {
                        existing.install_location = record.install_location;
                    }
                    if existing.uninstall_command.is_none() && record.uninstall_command.is_some() {
                        existing.uninstall_command = record.uninstall_command;
                    }
                    if existing.quiet_uninstall_command.is_none()
                        && record.quiet_uninstall_command.is_some()
                    {
                        existing.quiet_uninstall_command = record.quiet_uninstall_command;
                    }
                    if existing.estimated_size.is_none() && record.estimated_size.is_some() {
                        existing.estimated_size = record.estimated_size;
                    }
                    if existing.display_icon.is_none() && record.display_icon.is_some() {
                        existing.display_icon = record.display_icon;
                    }
                    if existing.main_exe_path.is_none() && record.main_exe_path.is_some() {
                        existing.main_exe_path = record.main_exe_path;
                    }
                }
            } else {
                map.insert(dedup_key, record);
            }
        }

        let mut result: Vec<SoftwareRecord> = map.into_values().collect();
        result.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deduplication_same_product_multiple_views() {
        let r1 = SoftwareRecord {
            id: "1".to_string(),
            display_name: "Git".to_string(),
            publisher: Some("The Git Community".to_string()),
            version: Some("2.48.1".to_string()),
            install_location: Some(r"C:\Program Files\Git".to_string()),
            install_date: Some("2025-01-10".to_string()),
            architecture: Some("x64".to_string()),
            uninstall_command: Some(r"C:\Program Files\Git\unins000.exe".to_string()),
            quiet_uninstall_command: None,
            estimated_size: Some(1024 * 1024 * 50),
            source: "HKLM (64-bit)".to_string(),
            registry_key: Some("Git_is1".to_string()),
            package_family: None,
            display_icon: Some(r"C:\Program Files\Git\git-bash.exe".to_string()),
            main_exe_path: Some(r"C:\Program Files\Git\git-bash.exe".to_string()),
            is_signed: None,
            signer_name: None,
        };

        let r2 = SoftwareRecord {
            id: "2".to_string(),
            display_name: "Git".to_string(),
            publisher: Some("The Git Community".to_string()),
            version: Some("2.48.1".to_string()),
            install_location: Some(r"C:\Program Files\Git".to_string()),
            install_date: Some("2025-01-10".to_string()),
            architecture: Some("x86".to_string()),
            uninstall_command: Some(r"C:\Program Files\Git\unins000.exe".to_string()),
            quiet_uninstall_command: None,
            estimated_size: Some(1024 * 1024 * 50),
            source: "HKLM (32-bit/WOW64)".to_string(),
            registry_key: Some("Git_is1".to_string()),
            package_family: None,
            display_icon: None,
            main_exe_path: None,
            is_signed: None,
            signer_name: None,
        };

        let list = vec![r1, r2];
        let deduped = SoftwareScanner::deduplicate_records(list);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].architecture.as_deref(), Some("x64"));
        assert_eq!(deduped[0].display_name, "Git");
    }

    #[test]
    fn test_different_versions_not_merged() {
        let r1 = SoftwareRecord {
            id: "1".to_string(),
            display_name: "Python".to_string(),
            publisher: Some("Python Software Foundation".to_string()),
            version: Some("3.10.4".to_string()),
            install_location: Some(r"C:\Python310".to_string()),
            install_date: None,
            architecture: Some("x64".to_string()),
            uninstall_command: None,
            quiet_uninstall_command: None,
            estimated_size: None,
            source: "HKLM (64-bit)".to_string(),
            registry_key: Some("Python3.10".to_string()),
            package_family: None,
            display_icon: None,
            main_exe_path: None,
            is_signed: None,
            signer_name: None,
        };

        let r2 = SoftwareRecord {
            id: "2".to_string(),
            display_name: "Python".to_string(),
            publisher: Some("Python Software Foundation".to_string()),
            version: Some("3.12.1".to_string()),
            install_location: Some(r"C:\Python312".to_string()),
            install_date: None,
            architecture: Some("x64".to_string()),
            uninstall_command: None,
            quiet_uninstall_command: None,
            estimated_size: None,
            source: "HKLM (64-bit)".to_string(),
            registry_key: Some("Python3.12".to_string()),
            package_family: None,
            display_icon: None,
            main_exe_path: None,
            is_signed: None,
            signer_name: None,
        };

        let list = vec![r1, r2];
        let deduped = SoftwareScanner::deduplicate_records(list);
        assert_eq!(deduped.len(), 2);
    }

    #[test]
    fn test_resolve_main_exe() {
        let loc = Some(r"C:\Program Files\App\app.exe".to_string());
        let icon = Some(r"C:\Program Files\App\icon.ico".to_string());
        let exe = SoftwareScanner::resolve_main_exe(&loc, &icon);
        assert_eq!(exe, Some(r"C:\Program Files\App\app.exe".to_string()));

        let icon_exe = Some(r"C:\Program Files\App\runner.exe".to_string());
        let exe2 = SoftwareScanner::resolve_main_exe(&None, &icon_exe);
        assert_eq!(exe2, Some(r"C:\Program Files\App\runner.exe".to_string()));
    }
}
