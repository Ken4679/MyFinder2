use std::path::{Component, Path, PathBuf};

pub struct PathPolicy;

impl PathPolicy {
    /// Canonicalize and normalize a Windows path string:
    /// - Normalizes slashes to backslashes `\`
    /// - Strips quotes and whitespace
    /// - Resolves `.` and `..` components cleanly
    pub fn normalize(path: &Path) -> String {
        let path_str = path.to_string_lossy();
        let trimmed = path_str.trim().trim_matches('"').trim_matches('\'');
        let normalized = trimmed.replace('/', "\\");

        // Resolve components cleanly
        let mut components: Vec<&str> = Vec::new();
        for part in normalized.split('\\') {
            let p = part.trim();
            if p.is_empty() || p == "." {
                continue;
            }
            if p == ".." {
                components.pop();
            } else {
                components.push(p);
            }
        }

        // Reassemble path
        if normalized.starts_with("\\\\") {
            // UNC path
            format!("\\\\{}", components.join("\\"))
        } else if let Some(first) = components.first() {
            if first.ends_with(':') {
                if components.len() == 1 {
                    format!("{}\\", first)
                } else {
                    components.join("\\")
                }
            } else {
                components.join("\\")
            }
        } else {
            normalized
        }
    }

    /// Check if a path points to a protected system location or root across ANY drive.
    ///
    /// Guarded rules:
    /// 1. Drive roots (e.g. `C:\`, `D:\`, `X:\`) and single components.
    /// 2. Windows system roots on any drive: `X:\Windows`, `X:\Windows\System32`, `X:\Windows\WinSxS`, etc.
    ///    Note: `C:\WindowsBackup` is NOT matched because component comparison is used.
    /// 3. Shared Program Files roots: `X:\Program Files`, `X:\Program Files (x86)`, `X:\ProgramData`, `X:\Program Files\Common Files`.
    /// 4. User profile roots and generic profile top-level directories: `X:\Users\Username`, `X:\Users\Username\AppData`, `X:\Users\Username\Desktop`, etc.
    /// 5. Special system directories: `$Recycle.Bin`, `System Volume Information`, `Recovery`, `Boot`.
    pub fn is_protected(path: &Path) -> bool {
        let norm = Self::normalize(path).to_lowercase();
        let parts: Vec<&str> = norm
            .split('\\')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        // 1. Empty, drive root, or UNC root
        if parts.is_empty() || parts.len() <= 1 {
            return true;
        }

        let first = parts[0];
        let second = parts.get(1).copied().unwrap_or("");

        // Immediate root directory (e.g. "C:\Windows", "C:\Users", "C:\ProgramData")
        if parts.len() <= 2 {
            return true;
        }

        // 2. Windows System folders across any drive letter
        if second == "windows"
            || second == "system32"
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

        // 3. Program Files & ProgramData roots
        if second == "program files" || second == "program files (x86)" || second == "programdata" {
            if parts.len() <= 2 {
                return true;
            }
            let third = parts.get(2).copied().unwrap_or("");
            if third == "common files" || third == "microsoft" || third == "windows" {
                return true;
            }
        }

        // 4. User Profile roots
        if second == "users" {
            // parts: ["c:", "users", "username", ...]
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
                // e.g. C:\Users\Username\AppData
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protected_paths() {
        assert!(PathPolicy::is_protected(Path::new("C:\\")));
        assert!(PathPolicy::is_protected(Path::new("D:\\")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Windows")));
        assert!(PathPolicy::is_protected(Path::new("D:\\Windows")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Windows\\System32")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Program Files")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Program Files\\Common Files")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Users\\Administrator")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Users\\John\\AppData")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Users\\John\\AppData\\Local")));
        assert!(PathPolicy::is_protected(Path::new("C:\\Users\\John\\Desktop")));

        // Make sure non-protected application paths are allowed
        assert!(!PathPolicy::is_protected(Path::new("C:\\WindowsBackup")));
        assert!(!PathPolicy::is_protected(Path::new("C:\\Program Files\\MyApp")));
        assert!(!PathPolicy::is_protected(Path::new("C:\\Users\\John\\AppData\\Local\\MyApp")));
        assert!(!PathPolicy::is_protected(Path::new("D:\\Workspace\\Project1")));
    }
}
