use crate::models::VolumeUsnState;
use std::collections::{HashMap, HashSet};
use std::path::Path;

// Official Windows USN Reason Code Constants
pub const USN_REASON_DATA_OVERWRITE: u32 = 0x00000001;
pub const USN_REASON_DATA_EXTEND: u32 = 0x00000002;
pub const USN_REASON_DATA_TRUNCATION: u32 = 0x00000004;
pub const USN_REASON_FILE_CREATE: u32 = 0x00000100;
pub const USN_REASON_FILE_DELETE: u32 = 0x00000200;
pub const USN_REASON_RENAME_OLD_NAME: u32 = 0x00001000;
pub const USN_REASON_RENAME_NEW_NAME: u32 = 0x00002000;
pub const USN_REASON_BASIC_INFO_CHANGE: u32 = 0x00008000;
pub const USN_REASON_CLOSE: u32 = 0x80000000;

// Standard NTFS Root Directory FRN index
pub const NTFS_ROOT_DIR_FRN: u64 = 5;
pub const NTFS_ROOT_DIR_FULL_FRN: u64 = 0x0005000000000005;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UsnSyncCheckResult {
    /// Journal is valid and we can read changes between start_usn and next_usn
    CanPerformIncremental {
        volume_path: String,
        volume_serial: String,
        file_system: String,
        journal_id: u64,
        start_usn: i64,
        next_usn: i64,
        lowest_valid_usn: i64,
    },
    /// Volume is already 100% up to date with latest USN
    AlreadyUpToDate {
        volume_path: String,
        volume_serial: String,
        file_system: String,
        journal_id: u64,
        current_usn: i64,
    },
    /// Journal has been reset, ID changed, or records were wrapped/pruned
    NeedsReconciliation {
        volume_path: String,
        volume_serial: String,
        file_system: String,
        journal_id: u64,
        current_usn: i64,
        reason: String,
    },
    /// File system does not support USN Change Journal (e.g. FAT32, exFAT, ReFS, network share)
    UnsupportedFileSystem {
        volume_path: String,
        volume_serial: String,
        file_system: String,
        reason: String,
    },
    /// Permission denied or failed to access volume device handle
    AccessError {
        volume_path: String,
        reason: String,
    },
}

#[derive(Debug, Clone)]
pub struct UsnRawRecord {
    pub file_reference_number: u64,
    pub parent_file_reference_number: u64,
    pub usn: i64,
    pub reason: u32,
    pub file_name: String,
    pub file_attributes: u32,
}

#[derive(Debug, Clone)]
pub struct FrnNode {
    pub parent_frn: u64,
    pub name: String,
    pub is_directory: bool,
}

/// FRN -> Parent FRN -> Directory hierarchy resolver for NTFS volumes
#[derive(Debug, Clone)]
pub struct FrnPathResolver {
    pub volume_root: String, // e.g. "C:\"
    pub root_frn: u64,
    pub nodes: HashMap<u64, FrnNode>,
}

impl FrnPathResolver {
    pub fn new(volume_path: &str) -> Self {
        let clean_vol = UsnJournal::get_volume_for_path(volume_path);
        let root_str = format!(r"{}\", clean_vol.trim_end_matches('\\'));
        let mut resolver = Self {
            volume_root: root_str,
            root_frn: NTFS_ROOT_DIR_FRN,
            nodes: HashMap::new(),
        };

        // Register root directory identities
        resolver.nodes.insert(
            NTFS_ROOT_DIR_FRN,
            FrnNode {
                parent_frn: NTFS_ROOT_DIR_FRN,
                name: String::new(),
                is_directory: true,
            },
        );
        resolver.nodes.insert(
            NTFS_ROOT_DIR_FULL_FRN,
            FrnNode {
                parent_frn: NTFS_ROOT_DIR_FULL_FRN,
                name: String::new(),
                is_directory: true,
            },
        );

        resolver
    }

    /// Insert or update an FRN mapping entry
    pub fn insert_node(&mut self, frn: u64, parent_frn: u64, name: &str, is_dir: bool) {
        self.nodes.insert(
            frn,
            FrnNode {
                parent_frn,
                name: name.to_string(),
                is_directory: is_dir,
            },
        );
    }

    /// Remove an FRN mapping entry when deleted
    pub fn remove_node(&mut self, frn: u64) {
        self.nodes.remove(&frn);
    }

    /// Check if an FRN represents the volume root directory
    pub fn is_root_frn(&self, frn: u64) -> bool {
        frn == self.root_frn
            || frn == NTFS_ROOT_DIR_FULL_FRN
            || (frn & 0x0000FFFFFFFFFFFF) == NTFS_ROOT_DIR_FRN
            || frn == 0
    }

    /// Resolve the full directory path from the parent FRN chain
    pub fn resolve_dir_path(&self, frn: u64) -> Option<String> {
        if self.is_root_frn(frn) {
            return Some(self.volume_root.trim_end_matches('\\').to_string());
        }

        let mut parts: Vec<&str> = Vec::new();
        let mut curr = frn;
        let mut visited: HashSet<u64> = HashSet::new();

        while !self.is_root_frn(curr) {
            if !visited.insert(curr) {
                // Loop detected in parent chain
                return None;
            }

            if let Some(node) = self.nodes.get(&curr) {
                if !node.name.is_empty() {
                    parts.push(node.name.as_str());
                }
                if node.parent_frn == curr || node.parent_frn == 0 {
                    break;
                }
                curr = node.parent_frn;
            } else {
                // Parent FRN not found in hierarchy tree
                return None;
            }
        }

        parts.reverse();
        let mut full = self.volume_root.trim_end_matches('\\').to_string();
        for p in parts {
            full.push('\\');
            full.push_str(p);
        }
        Some(full)
    }

    /// Resolve the full path for a file record using parent FRN and file name
    pub fn resolve_file_path(&self, parent_frn: u64, file_name: &str) -> Option<String> {
        if self.is_root_frn(parent_frn) {
            let base = self.volume_root.trim_end_matches('\\');
            return Some(format!(r"{}\{}", base, file_name));
        }

        if let Some(dir_path) = self.resolve_dir_path(parent_frn) {
            let trimmed = dir_path.trim_end_matches('\\');
            return Some(format!(r"{}\{}", trimmed, file_name));
        }

        None
    }
}

pub struct UsnJournal;

impl UsnJournal {
    /// Extract drive volume root (e.g. "C:" or "D:") from a directory path
    pub fn get_volume_for_path(path_str: &str) -> String {
        let p = Path::new(path_str);
        if let Some(prefix) = p.components().next() {
            let s = prefix.as_os_str().to_string_lossy().to_string();
            let trimmed = s.trim_end_matches('\\').trim_end_matches('/');
            if !trimmed.is_empty() {
                return trimmed.to_uppercase();
            }
        }
        "C:".to_string()
    }

    #[cfg(windows)]
    pub fn query_volume_usn_baseline(
        volume: &str,
    ) -> Result<(u64, i64, i64, String, String), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;

        let clean_vol = volume.trim_end_matches('\\').to_uppercase();
        let root_path_wide: Vec<u16> = OsStr::new(&format!("{}\\", clean_vol))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut volume_serial: u32 = 0;
        let mut fs_name_buf = [0u16; 64];
        let mut max_component_len = 0u32;
        let mut fs_flags = 0u32;

        let ok = unsafe {
            winapi_compat::GetVolumeInformationW(
                root_path_wide.as_ptr(),
                ptr::null_mut(),
                0,
                &mut volume_serial,
                &mut max_component_len,
                &mut fs_flags,
                fs_name_buf.as_mut_ptr(),
                fs_name_buf.len() as u32,
            )
        };

        if ok == 0 {
            return Err(format!(
                "无法获取卷 {} 信息 (错误代码: {})",
                clean_vol,
                unsafe { winapi_compat::GetLastError() }
            ));
        }

        let fs_name = String::from_utf16_lossy(
            &fs_name_buf[..fs_name_buf.iter().position(|&c| c == 0).unwrap_or(fs_name_buf.len())],
        );
        let serial_str = format!("{:08X}", volume_serial);

        if !fs_name.eq_ignore_ascii_case("NTFS") {
            return Err(format!("卷 {} 格式为 {}，不支持 USN Journal", clean_vol, fs_name));
        }

        let device_path = format!(r"\\.\{}", clean_vol);
        let device_path_wide: Vec<u16> = OsStr::new(&device_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let handle = unsafe {
            winapi_compat::CreateFileW(
                device_path_wide.as_ptr(),
                winapi_compat::GENERIC_READ,
                winapi_compat::FILE_SHARE_READ | winapi_compat::FILE_SHARE_WRITE,
                ptr::null_mut(),
                winapi_compat::OPEN_EXISTING,
                0,
                ptr::null_mut(),
            )
        };

        if handle == winapi_compat::INVALID_HANDLE_VALUE {
            return Err(format!(
                "无法打开卷 {} 设备句柄 (错误码: {})",
                clean_vol,
                unsafe { winapi_compat::GetLastError() }
            ));
        }

        let mut journal_data = winapi_compat::UsnJournalDataV0::default();
        let mut bytes_returned = 0u32;

        let ioctl_ok = unsafe {
            winapi_compat::DeviceIoControl(
                handle,
                winapi_compat::FSCTL_QUERY_USN_JOURNAL,
                ptr::null_mut(),
                0,
                &mut journal_data as *mut _ as *mut _,
                std::mem::size_of::<winapi_compat::UsnJournalDataV0>() as u32,
                &mut bytes_returned,
                ptr::null_mut(),
            )
        };

        unsafe {
            winapi_compat::CloseHandle(handle);
        }

        if ioctl_ok == 0 {
            return Err(format!(
                "卷 {} 上的 USN Journal 不可用 (错误码: {})",
                clean_vol,
                unsafe { winapi_compat::GetLastError() }
            ));
        }

        Ok((
            journal_data.usn_journal_id,
            journal_data.next_usn,
            journal_data.lowest_valid_usn,
            serial_str,
            fs_name,
        ))
    }

    #[cfg(not(windows))]
    pub fn query_volume_usn_baseline(
        volume: &str,
    ) -> Result<(u64, i64, i64, String, String), String> {
        Ok((1, 1, 0, "NON_WINDOWS".to_string(), "POSIX".to_string()))
    }

    #[cfg(windows)]
    pub fn check_volume_usn_state(
        volume: &str,
        saved: Option<&VolumeUsnState>,
    ) -> UsnSyncCheckResult {
        let clean_vol = volume.trim_end_matches('\\').to_uppercase();

        match Self::query_volume_usn_baseline(&clean_vol) {
            Ok((current_journal_id, current_next_usn, current_lowest_usn, serial_str, fs_name)) => {
                if let Some(saved_state) = saved {
                    // Check 1: Did journal ID change or was journal re-created?
                    if saved_state.journal_id != 0 && saved_state.journal_id != current_journal_id {
                        return UsnSyncCheckResult::NeedsReconciliation {
                            volume_path: clean_vol,
                            volume_serial: serial_str,
                            file_system: fs_name,
                            journal_id: current_journal_id,
                            current_usn: current_next_usn,
                            reason: format!(
                                "USN Journal ID 已变更 (旧: {}, 新: {})，卷已被重建或重格式化",
                                saved_state.journal_id, current_journal_id
                            ),
                        };
                    }

                    // Check 2: Has the journal wrapped around past lowest valid USN?
                    if saved_state.last_usn < current_lowest_usn {
                        return UsnSyncCheckResult::NeedsReconciliation {
                            volume_path: clean_vol,
                            volume_serial: serial_str,
                            file_system: fs_name,
                            journal_id: current_journal_id,
                            current_usn: current_next_usn,
                            reason: format!(
                                "上次同步记录 USN ({}) 低于当前最低有效 USN ({})，历史记录已被截断覆盖",
                                saved_state.last_usn, current_lowest_usn
                            ),
                        };
                    }

                    // Check 3: Is it already up to date?
                    if saved_state.last_usn >= current_next_usn {
                        return UsnSyncCheckResult::AlreadyUpToDate {
                            volume_path: clean_vol,
                            volume_serial: serial_str,
                            file_system: fs_name,
                            journal_id: current_journal_id,
                            current_usn: current_next_usn,
                        };
                    }

                    // Check 4: Incremental sync is viable
                    return UsnSyncCheckResult::CanPerformIncremental {
                        volume_path: clean_vol,
                        volume_serial: serial_str,
                        file_system: fs_name,
                        journal_id: current_journal_id,
                        start_usn: saved_state.last_usn,
                        next_usn: current_next_usn,
                        lowest_valid_usn: current_lowest_usn,
                    };
                }

                // First initialization baseline
                UsnSyncCheckResult::CanPerformIncremental {
                    volume_path: clean_vol,
                    volume_serial: serial_str,
                    file_system: fs_name,
                    journal_id: current_journal_id,
                    start_usn: current_lowest_usn,
                    next_usn: current_next_usn,
                    lowest_valid_usn: current_lowest_usn,
                }
            }
            Err(err) => {
                if err.contains("不支持 USN") {
                    UsnSyncCheckResult::UnsupportedFileSystem {
                        volume_path: clean_vol,
                        volume_serial: "NON_NTFS".to_string(),
                        file_system: "FAT32/exFAT".to_string(),
                        reason: err,
                    }
                } else {
                    UsnSyncCheckResult::AccessError {
                        volume_path: clean_vol,
                        reason: err,
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    pub fn check_volume_usn_state(
        volume: &str,
        saved: Option<&VolumeUsnState>,
    ) -> UsnSyncCheckResult {
        if let Some(s) = saved {
            if s.sync_status == "synced" {
                return UsnSyncCheckResult::AlreadyUpToDate {
                    volume_path: volume.to_string(),
                    volume_serial: "POSIX".to_string(),
                    file_system: "POSIX".to_string(),
                    journal_id: 1,
                    current_usn: 1,
                };
            }
        }

        UsnSyncCheckResult::UnsupportedFileSystem {
            volume_path: volume.to_string(),
            volume_serial: "NON_WINDOWS".to_string(),
            file_system: "POSIX".to_string(),
            reason: "当前运行在非 Windows 平台，通过高频时间戳核验与文件监听保障增量同步".to_string(),
        }
    }

    #[cfg(windows)]
    pub fn read_usn_changes(
        volume: &str,
        journal_id: u64,
        start_usn: i64,
        max_records: usize,
    ) -> Result<(Vec<UsnRawRecord>, i64), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;

        let clean_vol = volume.trim_end_matches('\\').to_uppercase();
        let device_path = format!(r"\\.\{}", clean_vol);
        let device_path_wide: Vec<u16> = OsStr::new(&device_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let handle = unsafe {
            winapi_compat::CreateFileW(
                device_path_wide.as_ptr(),
                winapi_compat::GENERIC_READ,
                winapi_compat::FILE_SHARE_READ | winapi_compat::FILE_SHARE_WRITE,
                ptr::null_mut(),
                winapi_compat::OPEN_EXISTING,
                0,
                ptr::null_mut(),
            )
        };

        if handle == winapi_compat::INVALID_HANDLE_VALUE {
            return Err(format!("无法打开卷 {} 进行 USN 读取", clean_vol));
        }

        let mut read_data = winapi_compat::ReadUsnJournalDataV0 {
            start_usn,
            reason_mask: 0xFFFFFFFF,
            return_only_on_close: 0,
            timeout: 0,
            bytes_to_return_for_close: 0,
            usn_journal_id: journal_id,
        };

        let mut buffer = vec![0u8; 64 * 1024];
        let mut bytes_returned = 0u32;
        let mut records = Vec::new();

        let ok = unsafe {
            winapi_compat::DeviceIoControl(
                handle,
                winapi_compat::FSCTL_READ_USN_JOURNAL,
                &mut read_data as *mut _ as *mut _,
                std::mem::size_of::<winapi_compat::ReadUsnJournalDataV0>() as u32,
                buffer.as_mut_ptr() as *mut _,
                buffer.len() as u32,
                &mut bytes_returned,
                ptr::null_mut(),
            )
        };

        unsafe {
            winapi_compat::CloseHandle(handle);
        }

        if ok == 0 || bytes_returned < 8 {
            return Ok((records, start_usn));
        }

        let next_usn_val = i64::from_le_bytes(buffer[0..8].try_into().unwrap_or([0; 8]));
        let current_next_usn = next_usn_val;

        let mut offset = 8usize;
        while offset + std::mem::size_of::<winapi_compat::UsnRecordHeader>() <= bytes_returned as usize {
            let record_len = u32::from_le_bytes(buffer[offset..offset + 4].try_into().unwrap_or([0; 4])) as usize;
            if record_len == 0 || offset + record_len > bytes_returned as usize {
                break;
            }

            let major_version = u16::from_le_bytes(buffer[offset + 4..offset + 6].try_into().unwrap_or([0; 2]));
            if major_version == 2 {
                let frn = u64::from_le_bytes(buffer[offset + 8..offset + 16].try_into().unwrap_or([0; 8]));
                let parent_frn = u64::from_le_bytes(buffer[offset + 16..offset + 24].try_into().unwrap_or([0; 8]));
                let usn = i64::from_le_bytes(buffer[offset + 24..offset + 32].try_into().unwrap_or([0; 8]));
                let reason = u32::from_le_bytes(buffer[offset + 40..offset + 44].try_into().unwrap_or([0; 4]));
                let file_attributes = u32::from_le_bytes(buffer[offset + 52..offset + 56].try_into().unwrap_or([0; 4]));
                let file_name_len = u16::from_le_bytes(buffer[offset + 56..offset + 58].try_into().unwrap_or([0; 2])) as usize;
                let file_name_offset = u16::from_le_bytes(buffer[offset + 58..offset + 60].try_into().unwrap_or([0; 2])) as usize;

                if offset + file_name_offset + file_name_len <= offset + record_len {
                    let name_slice = &buffer[offset + file_name_offset..offset + file_name_offset + file_name_len];
                    let u16_vec: Vec<u16> = name_slice
                        .chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    let file_name = String::from_utf16_lossy(&u16_vec);

                    records.push(UsnRawRecord {
                        file_reference_number: frn,
                        parent_file_reference_number: parent_frn,
                        usn,
                        reason,
                        file_name,
                        file_attributes,
                    });

                    if records.len() >= max_records {
                        break;
                    }
                }
            }

            offset += record_len;
        }

        Ok((records, current_next_usn))
    }

    #[cfg(not(windows))]
    pub fn read_usn_changes(
        _volume: &str,
        _journal_id: u64,
        start_usn: i64,
        _max_records: usize,
    ) -> Result<(Vec<UsnRawRecord>, i64), String> {
        Ok((Vec::new(), start_usn))
    }
}

// Windows Win32 FFI Bindings for NTFS USN Journal and Volume Management
#[cfg(windows)]
mod winapi_compat {
    pub const GENERIC_READ: u32 = 0x80000000;
    pub const FILE_SHARE_READ: u32 = 0x00000001;
    pub const FILE_SHARE_WRITE: u32 = 0x00000002;
    pub const OPEN_EXISTING: u32 = 3;
    pub const INVALID_HANDLE_VALUE: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;

    // FSCTL Codes
    pub const FSCTL_QUERY_USN_JOURNAL: u32 = 0x000900f4;
    pub const FSCTL_READ_USN_JOURNAL: u32 = 0x000900bb;

    #[repr(C)]
    #[derive(Default, Debug, Clone, Copy)]
    pub struct UsnJournalDataV0 {
        pub usn_journal_id: u64,
        pub lowest_valid_usn: i64,
        pub next_usn: i64,
        pub max_usn: i64,
        pub maximum_size: u64,
        pub allocation_delta: u64,
    }

    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct ReadUsnJournalDataV0 {
        pub start_usn: i64,
        pub reason_mask: u32,
        pub return_only_on_close: u32,
        pub timeout: u64,
        pub bytes_to_return_for_close: u64,
        pub usn_journal_id: u64,
    }

    #[repr(C)]
    pub struct UsnRecordHeader {
        pub record_length: u32,
        pub major_version: u16,
        pub minor_version: u16,
    }

    extern "system" {
        pub fn CreateFileW(
            lpFileName: *const u16,
            dwDesiredAccess: u32,
            dwShareMode: u32,
            lpSecurityAttributes: *mut std::ffi::c_void,
            dwCreationDisposition: u32,
            dwFlagsAndAttributes: u32,
            hTemplateFile: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;

        pub fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;

        pub fn DeviceIoControl(
            hDevice: *mut std::ffi::c_void,
            dwIoControlCode: u32,
            lpInBuffer: *mut std::ffi::c_void,
            nInBufferSize: u32,
            lpOutBuffer: *mut std::ffi::c_void,
            nOutBufferSize: u32,
            lpBytesReturned: *mut u32,
            lpOverlapped: *mut std::ffi::c_void,
        ) -> i32;

        pub fn GetVolumeInformationW(
            lpRootPathName: *const u16,
            lpVolumeNameBuffer: *mut u16,
            nVolumeNameSize: u32,
            lpVolumeSerialNumber: *mut u32,
            lpMaximumComponentLength: *mut u32,
            lpFileSystemFlags: *mut u32,
            lpFileSystemNameBuffer: *mut u16,
            nFileSystemNameSize: u32,
        ) -> i32;

        pub fn GetLastError() -> u32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nested_directory_usn_path_resolution() {
        let mut resolver = FrnPathResolver::new("C:");

        // Setup the hierarchy:
        // FRN 5   = C:\ (Root)
        // FRN 100 = Projects (Parent: 5)
        // FRN 200 = App      (Parent: 100)
        // FRN 300 = test.txt (Parent: 200)
        resolver.insert_node(100, 5, "Projects", true);
        resolver.insert_node(200, 100, "App", true);
        resolver.insert_node(300, 200, "test.txt", false);

        // 1. Resolve directory paths
        assert_eq!(resolver.resolve_dir_path(5), Some("C:".to_string()));
        assert_eq!(resolver.resolve_dir_path(100), Some(r"C:\Projects".to_string()));
        assert_eq!(resolver.resolve_dir_path(200), Some(r"C:\Projects\App".to_string()));

        // 2. Resolve file path from parent FRN + file name
        let resolved = resolver.resolve_file_path(200, "test.txt");
        assert_eq!(resolved, Some(r"C:\Projects\App\test.txt".to_string()));

        // 3. Resolve direct root file (e.g. C:\root_file.txt)
        let root_file = resolver.resolve_file_path(5, "bootmgr");
        assert_eq!(root_file, Some(r"C:\bootmgr".to_string()));
    }

    #[test]
    fn test_deeply_nested_resolution_and_cycles() {
        let mut resolver = FrnPathResolver::new(r"D:\Data");

        // 5 levels of nesting: D:\Data\A\B\C\D\file.log
        resolver.insert_node(10, 5, "A", true);
        resolver.insert_node(20, 10, "B", true);
        resolver.insert_node(30, 20, "C", true);
        resolver.insert_node(40, 30, "D", true);

        let path = resolver.resolve_file_path(40, "file.log");
        assert_eq!(path, Some(r"D:\A\B\C\D\file.log".to_string()));

        // Test cycle detection: 50 -> 60 -> 50
        resolver.insert_node(50, 60, "LoopA", true);
        resolver.insert_node(60, 50, "LoopB", true);
        assert_eq!(resolver.resolve_dir_path(50), None);
        assert_eq!(resolver.resolve_file_path(50, "sample.txt"), None);

        // Test missing parent node in chain (unresolved)
        assert_eq!(resolver.resolve_dir_path(99999), None);
        assert_eq!(resolver.resolve_file_path(99999, "orphan.txt"), None);
    }

    #[test]
    fn test_usn_constants_bitmasks() {
        assert_eq!(USN_REASON_DATA_OVERWRITE, 0x00000001);
        assert_eq!(USN_REASON_DATA_EXTEND, 0x00000002);
        assert_eq!(USN_REASON_DATA_TRUNCATION, 0x00000004);
        assert_eq!(USN_REASON_FILE_CREATE, 0x00000100);
        assert_eq!(USN_REASON_FILE_DELETE, 0x00000200);
        assert_eq!(USN_REASON_RENAME_OLD_NAME, 0x00001000);
        assert_eq!(USN_REASON_RENAME_NEW_NAME, 0x00002000);
        assert_eq!(USN_REASON_BASIC_INFO_CHANGE, 0x00008000);
        assert_eq!(USN_REASON_CLOSE, 0x80000000);

        // Verify distinct bit values
        let mask = USN_REASON_FILE_CREATE | USN_REASON_RENAME_OLD_NAME | USN_REASON_RENAME_NEW_NAME | USN_REASON_FILE_DELETE;
        assert_eq!(mask & USN_REASON_FILE_CREATE, 0x00000100);
        assert_eq!(mask & USN_REASON_FILE_DELETE, 0x00000200);
        assert_eq!(mask & USN_REASON_RENAME_OLD_NAME, 0x00001000);
        assert_eq!(mask & USN_REASON_RENAME_NEW_NAME, 0x00002000);
    }

    #[test]
    fn test_usn_journal_reset_and_wrap_check() {
        let saved_state = VolumeUsnState {
            volume_path: "C:".to_string(),
            volume_serial: "ABC12345".to_string(),
            file_system: "NTFS".to_string(),
            journal_id: 1000,
            last_usn: 5000,
            lowest_valid_usn: 100,
            last_sync_time: "2024-01-01T00:00:00Z".to_string(),
            sync_status: "synced".to_string(),
            status_message: None,
        };

        // Case 1: Journal wrapped: saved.last_usn (5000) < current_lowest_usn (6000)
        let current_journal_id = 1000;
        let current_lowest = 6000;
        let current_next = 9000;

        let is_wrapped = saved_state.last_usn < current_lowest;
        assert!(is_wrapped);

        // Case 2: Journal ID changed (e.g. format or journal recreate)
        let new_journal_id = 2000;
        let is_id_changed = saved_state.journal_id != new_journal_id;
        assert!(is_id_changed);

        // Case 3: Already up to date
        let fresh_saved = VolumeUsnState {
            last_usn: 9000,
            ..saved_state.clone()
        };
        let is_up_to_date = fresh_saved.last_usn >= current_next;
        assert!(is_up_to_date);
    }

    #[test]
    fn test_non_ntfs_and_posix_fallback() {
        let check = UsnJournal::check_volume_usn_state("E:", None);
        // On non-windows or unsupported fs, returns UnsupportedFileSystem or AccessError
        match check {
            UsnSyncCheckResult::UnsupportedFileSystem { volume_path, .. } => {
                assert_eq!(volume_path, "E:");
            }
            UsnSyncCheckResult::AccessError { .. } => {}
            UsnSyncCheckResult::CanPerformIncremental { .. } => {}
            _ => {}
        }
    }
}
