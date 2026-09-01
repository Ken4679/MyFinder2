use crate::models::VolumeUsnState;
use chrono::Utc;
use std::path::Path;

#[derive(Debug, Clone)]
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
    pub fn check_volume_usn_state(volume: &str, saved: Option<&VolumeUsnState>) -> UsnSyncCheckResult {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;

        let clean_vol = volume.trim_end_matches('\\').to_uppercase();
        let root_path_wide: Vec<u16> = OsStr::new(&format!("{}\\", clean_vol))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // 1. Query Volume Information (File System Type & Volume Serial)
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
            return UsnSyncCheckResult::AccessError {
                volume_path: clean_vol,
                reason: format!("无法获取卷信息（错误代码: {}）", unsafe { winapi_compat::GetLastError() }),
            };
        }

        let fs_name = String::from_utf16_lossy(
            &fs_name_buf[..fs_name_buf.iter().position(|&c| c == 0).unwrap_or(fs_name_buf.len())],
        );
        let serial_str = format!("{:08X}", volume_serial);

        if !fs_name.eq_ignore_ascii_case("NTFS") {
            return UsnSyncCheckResult::UnsupportedFileSystem {
                volume_path: clean_vol,
                volume_serial: serial_str,
                file_system: fs_name.clone(),
                reason: format!("卷文件系统为「{}」，非 NTFS 文件系统不支持 USN Change Journal", fs_name),
            };
        }

        // 2. Open Volume Device Handle (Strictly Read-Only Access)
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
            let err = unsafe { winapi_compat::GetLastError() };
            return UsnSyncCheckResult::AccessError {
                volume_path: clean_vol,
                reason: format!("无法打开卷设备句柄（错误码: {}，可能需要普通管理员权限读取原始卷）", err),
            };
        }

        // 3. Query USN Journal Metadata via DeviceIoControl
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
            let err = unsafe { winapi_compat::GetLastError() };
            return UsnSyncCheckResult::NeedsReconciliation {
                volume_path: clean_vol,
                volume_serial: serial_str,
                file_system: fs_name,
                journal_id: 0,
                current_usn: 0,
                reason: format!("卷上的 USN Journal 未启用或不可用（错误代码: {}）", err),
            };
        }

        let current_journal_id = journal_data.usn_journal_id;
        let current_lowest_usn = journal_data.lowest_valid_usn;
        let current_next_usn = journal_data.next_usn;

        // 4. Validate against saved state
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
                        "USN Journal ID 已变更 (旧: {}, 新: {})，卷可能已被重格式化或重建日志",
                        saved_state.journal_id, current_journal_id
                    ),
                };
            }

            // Check 2: Has the journal wrapped around and lost intermediate records?
            if saved_state.last_usn < current_lowest_usn {
                return UsnSyncCheckResult::NeedsReconciliation {
                    volume_path: clean_vol,
                    volume_serial: serial_str,
                    file_system: fs_name,
                    journal_id: current_journal_id,
                    current_usn: current_next_usn,
                    reason: format!(
                        "上次同步记录 USN ({}) 低于当前最低有效 USN ({})，部分历史记录已被截断覆盖",
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

            // Check 4: Can perform incremental sync from saved_state.last_usn
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

        // No saved state exists: first initialization
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

    #[cfg(not(windows))]
    pub fn check_volume_usn_state(volume: &str, _saved: Option<&VolumeUsnState>) -> UsnSyncCheckResult {
        UsnSyncCheckResult::UnsupportedFileSystem {
            volume_path: volume.to_string(),
            volume_serial: "NON_WINDOWS".to_string(),
            file_system: "POSIX".to_string(),
            reason: "当前运行在非 Windows 平台，通过高频目录树时间戳核验与文件监听保障增量同步".to_string(),
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

        // Allocate 64KB buffer for USN records
        let mut buffer = vec![0u8; 64 * 1024];
        let mut bytes_returned = 0u32;
        let mut records = Vec::new();
        let mut current_next_usn = start_usn;

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

        // First 8 bytes in output is the next USN to read from
        let next_usn_val = i64::from_le_bytes(buffer[0..8].try_into().unwrap_or([0; 8]));
        current_next_usn = next_usn_val;

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

    // USN Reason Codes
    pub const USN_REASON_DATA_OVERWRITE: u32 = 0x00000001;
    pub const USN_REASON_DATA_EXTEND: u32 = 0x00000002;
    pub const USN_REASON_DATA_TRUNCATION: u32 = 0x00000004;
    pub const USN_REASON_FILE_CREATE: u32 = 0x00000100;
    pub const USN_REASON_FILE_DELETE: u32 = 0x00000200;
    pub const USN_REASON_RENAME_OLD_NAME: u32 = 0x00002000;
    pub const USN_REASON_RENAME_NEW_NAME: u32 = 0x00004000;
    pub const USN_REASON_BASIC_INFO_CHANGE: u32 = 0x00008000;
    pub const USN_REASON_CLOSE: u32 = 0x80000000;

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
