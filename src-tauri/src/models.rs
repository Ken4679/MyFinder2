use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileCategory {
    Other = 0,
    Document = 1,
    Image = 2,
    Audio = 3,
    Video = 4,
    Executable = 5,
    Config = 6,
    Temp = 7,
    Archive = 8,
}

impl FileCategory {
    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => FileCategory::Document,
            2 => FileCategory::Image,
            3 => FileCategory::Audio,
            4 => FileCategory::Video,
            5 => FileCategory::Executable,
            6 => FileCategory::Config,
            7 => FileCategory::Temp,
            8 => FileCategory::Archive,
            _ => FileCategory::Other,
        }
    }

    pub fn from_extension(ext: &str) -> Self {
        let e = ext.trim_start_matches('.').to_lowercase();
        match e.as_str() {
            "txt" | "md" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "csv" | "rtf" | "epub" => {
                FileCategory::Document
            }
            "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "svg" | "ico" | "psd" | "raw" | "tif" | "tiff" => {
                FileCategory::Image
            }
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" | "mid" => FileCategory::Audio,
            "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "rmvb" => FileCategory::Video,
            "exe" | "msi" | "bat" | "cmd" | "ps1" | "vbs" | "com" | "scr" => FileCategory::Executable,
            "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "iso" => FileCategory::Archive,
            "json" | "xml" | "yaml" | "yml" | "ini" | "config" | "conf" | "toml" | "properties" | "env" => {
                FileCategory::Config
            }
            "tmp" | "temp" | "log" | "bak" | "cache" | "dmp" => FileCategory::Temp,
            _ => FileCategory::Other,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub path: String,
    pub file_name: String,
    pub directory: String,
    pub extension: String,
    pub size_bytes: i64,
    pub category: u8,
    pub created_time: String,
    pub updated_time: String,
    pub indexed_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingStatus {
    pub state: String, // "idle" | "indexing" | "cancelling" | "completed" | "cancelled" | "error"
    pub current_directory: Option<String>,
    pub current_file: Option<String>,
    pub files_discovered: u64,
    pub files_indexed: u64,
    pub files_skipped: u64,
    pub files_failed: u64,
    pub elapsed_ms: u64,
    pub message: Option<String>,
}

impl Default for IndexingStatus {
    fn default() -> Self {
        Self {
            state: "idle".to_string(),
            current_directory: None,
            current_file: None,
            files_discovered: 0,
            files_indexed: 0,
            files_skipped: 0,
            files_failed: 0,
            elapsed_ms: 0,
            message: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilter {
    pub query: String,
    pub category: Option<u8>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_deep_search: bool,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub total_files: u64,
    pub total_size_bytes: i64,
    pub last_indexed_time: Option<String>,
    pub db_size_bytes: i64,
    pub indexed_directories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareRecord {
    pub id: String,
    pub display_name: String,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub install_date: Option<String>,
    pub architecture: Option<String>,
    pub uninstall_command: Option<String>,
    pub quiet_uninstall_command: Option<String>,
    pub estimated_size: Option<u64>,
    pub source: String,
    pub registry_key: Option<String>,
    pub package_family: Option<String>,
    pub display_icon: Option<String>,
    pub main_exe_path: Option<String>,
    pub is_signed: Option<bool>,
    pub signer_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LeftoverItemType {
    Directory,
    File,
    RegistryKey,
    Shortcut,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LeftoverConfidence {
    High,
    Medium,
    Low,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LeftoverRisk {
    SafeToReview,
    NeedsReview,
    Protected,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverCandidate {
    pub id: String,
    pub item_type: LeftoverItemType,
    pub path: String,
    pub size_bytes: Option<u64>,
    pub confidence: LeftoverConfidence,
    pub risk: LeftoverRisk,
    pub reason: String,
    pub is_protected: bool,
    pub recommended_selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallPrecheckInfo {
    pub software_id: String,
    pub software_name: String,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub uninstaller_type: String, // "msi" | "exe" | "none"
    pub uninstaller_path: Option<String>,
    pub uninstaller_exists: bool,
    pub uninstall_command: Option<String>,
    pub is_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallLaunchResult {
    pub success: bool,
    pub process_id: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlan {
    pub software_id: String,
    pub software_name: String,
    pub items: Vec<LeftoverCandidate>,
    pub is_dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupItemResult {
    pub candidate_id: String,
    pub path: String,
    pub success: bool,
    pub status: String, // "removed" | "skipped_in_use" | "skipped_protected" | "skipped_not_found" | "failed" | "dry_run_simulated"
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionReport {
    pub software_name: String,
    pub total_candidates: usize,
    pub removed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub results: Vec<CleanupItemResult>,
    pub is_dry_run: bool,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub software_name: String,
    pub timestamp: String,
    pub action: String,
    pub details: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrustState {
    Trusted,
    LowRisk,
    NeedsReview,
    HighRisk,
    ProtectedSystem,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PathClassification {
    SystemProtected,
    InstalledApp,
    UserData,
    UserDownloads,
    TempOrCache,
    UserAppData,
    ExternalOrUnknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignatureStatus {
    ValidSignature,
    InvalidSignature,
    Unsigned,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigitalSignatureInfo {
    pub status: SignatureStatus,
    pub signer: Option<String>,
    pub issuer: Option<String>,
    pub subject: Option<String>,
    pub is_os_component: bool,
    pub verification_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublisherCorrelation {
    pub status: String, // "matched" | "discrepancy" | "no_signer" | "no_publisher" | "unknown"
    pub details: String,
    pub publisher_name: Option<String>,
    pub signer_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessAssociation {
    pub is_running: bool,
    pub process_id: Option<u32>,
    pub process_name: Option<String>,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashResult {
    pub algorithm: String,
    pub hash: String,
    pub file_size_bytes: u64,
    pub calculation_time_ms: u64,
    pub calculated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityAssessment {
    pub target_id: String,
    pub target_name: String,
    pub target_path: String,
    pub trust_state: TrustState,
    pub path_classification: PathClassification,
    pub file_category: String,
    pub is_executable_or_script: bool,
    pub is_protected: bool,
    pub signature: DigitalSignatureInfo,
    pub publisher_correlation: PublisherCorrelation,
    pub process_association: ProcessAssociation,
    pub signals: Vec<String>,
    pub reasons: Vec<String>,
    pub assessed_at: String,
}

