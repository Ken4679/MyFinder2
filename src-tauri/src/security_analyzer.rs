use crate::models::{
    DigitalSignatureInfo, HashResult, PathClassification, ProcessAssociation, PublisherCorrelation,
    SecurityAssessment, SignatureStatus, SoftwareRecord, TrustState,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

pub struct SecurityAnalyzer;

impl SecurityAnalyzer {
    /// Classify path context conservatively
    pub fn classify_path(path_str: &str) -> PathClassification {
        let p = path_str.replace('/', "\\");
        let lower = p.to_lowercase();

        // 1. Windows System & Protected Roots
        if lower.starts_with("c:\\windows")
            || lower.starts_with("c:\\winnt")
            || lower.contains("\\windows\\system32")
            || lower.contains("\\windows\\syswow64")
            || lower.contains("\\windows\\winsxs")
        {
            return PathClassification::SystemProtected;
        }

        // 2. Temp directories
        if lower.contains("\\appdata\\local\\temp")
            || lower.contains("\\windows\\temp")
            || lower.contains("\\temp\\")
            || lower.contains("/tmp")
        {
            return PathClassification::TempOrCache;
        }

        // 3. User Downloads
        if lower.contains("\\downloads\\") || lower.ends_with("\\downloads") {
            return PathClassification::UserDownloads;
        }

        // 4. Standard App Installation folders
        if lower.starts_with("c:\\program files\\")
            || lower.starts_with("c:\\program files (x86)\\")
            || lower.starts_with("c:\\programdata\\")
            || lower.contains("\\appdata\\local\\programs\\")
        {
            return PathClassification::InstalledApp;
        }

        // 5. User Data directories
        if lower.contains("\\documents\\")
            || lower.contains("\\desktop\\")
            || lower.contains("\\pictures\\")
            || lower.contains("\\music\\")
            || lower.contains("\\videos\\")
            || lower.contains("\\onedrive\\")
        {
            return PathClassification::UserData;
        }

        // 6. User AppData
        if lower.contains("\\appdata\\roaming\\") || lower.contains("\\appdata\\local\\") {
            return PathClassification::UserAppData;
        }

        PathClassification::ExternalOrUnknown
    }

    /// Check if an extension is an executable, script, or driver
    pub fn is_executable_or_script(extension: &str) -> bool {
        let ext = extension.trim_start_matches('.').to_lowercase();
        matches!(
            ext.as_str(),
            "exe" | "msi" | "bat" | "cmd" | "ps1" | "vbs" | "js" | "wsf" | "com" | "scr" | "sys" | "drv" | "dll" | "ocx"
        )
    }

    /// Local Authenticode Signature inspection (no cloud, 100% local Windows API or parser)
    pub fn inspect_digital_signature(file_path: &Path) -> DigitalSignatureInfo {
        if !file_path.exists() {
            return DigitalSignatureInfo {
                status: SignatureStatus::Unknown,
                signer: None,
                issuer: None,
                subject: None,
                is_os_component: false,
                verification_message: "文件不存在，无法提取数字签名".to_string(),
            };
        }

        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Only PE files, MSI, drivers, and scripts generally have Authenticode signatures
        if !matches!(
            ext.as_str(),
            "exe" | "dll" | "sys" | "msi" | "ps1" | "cat" | "cab"
        ) {
            return DigitalSignatureInfo {
                status: SignatureStatus::Unsigned,
                signer: None,
                issuer: None,
                subject: None,
                is_os_component: false,
                verification_message: "常规数据文件类型，通常不包含可执行数字签名".to_string(),
            };
        }

        #[cfg(target_os = "windows")]
        {
            let path_str = file_path.to_string_lossy();
            let ps_cmd = format!(
                "$sig = Get-AuthenticodeSignature -LiteralPath '{}'; [PSCustomObject]@{{ Status = $sig.Status.ToString(); Signer = $sig.SignerCertificate.Subject; Issuer = $sig.SignerCertificate.Issuer; IsOS = $sig.IsOSBinary }} | ConvertTo-Json -Compress",
                path_str.replace("'", "''")
            );

            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
                .output()
            {
                if output.status.success() {
                    let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&out_str) {
                        let status_str = val.get("Status").and_then(|v| v.as_str()).unwrap_or("");
                        let signer = val.get("Signer").and_then(|v| v.as_str()).map(|s| s.to_string());
                        let issuer = val.get("Issuer").and_then(|v| v.as_str()).map(|s| s.to_string());
                        let is_os = val.get("IsOS").and_then(|v| v.as_bool()).unwrap_or(false);

                        let (status, msg) = match status_str {
                            "Valid" => (
                                SignatureStatus::ValidSignature,
                                format!("数字签名有效 (由 {} 认证)", signer.as_deref().unwrap_or("未知发布商")),
                            ),
                            "NotSigned" => (
                                SignatureStatus::Unsigned,
                                "此可执行文件未包含有效 Windows Authenticode 数字签名".to_string(),
                            ),
                            "HashMismatch" => (
                                SignatureStatus::InvalidSignature,
                                "签名哈希不匹配，文件可能已被篡改或损坏".to_string(),
                            ),
                            "NotTrusted" | "UnknownError" => (
                                SignatureStatus::InvalidSignature,
                                "证书未受本系统信任或已过期".to_string(),
                            ),
                            _ => (
                                SignatureStatus::Unknown,
                                format!("签名验证结果: {}", status_str),
                            ),
                        };

                        return DigitalSignatureInfo {
                            status,
                            signer,
                            issuer,
                            subject: None,
                            is_os_component: is_os,
                            verification_message: msg,
                        };
                    }
                }
            }
        }

        // If Windows PowerShell verification was not available (e.g. non-Windows build, or execution disabled)
        if matches!(ext.as_str(), "exe" | "dll" | "sys" | "msi" | "ps1") {
            DigitalSignatureInfo {
                status: SignatureStatus::Unknown,
                signer: None,
                issuer: None,
                subject: None,
                is_os_component: false,
                verification_message: "当前系统未执行 Authenticode 签名核验或验证服务不可用 (Unknown)".to_string(),
            }
        } else {
            DigitalSignatureInfo {
                status: SignatureStatus::Unsigned,
                signer: None,
                issuer: None,
                subject: None,
                is_os_component: false,
                verification_message: "常规文件类型，无独立可执行数字签名".to_string(),
            }
        }
    }

    /// Read-only check to see if an executable is associated with an active running process
    pub fn check_running_process(file_path: &Path) -> ProcessAssociation {
        if !file_path.exists() {
            return ProcessAssociation {
                is_running: false,
                process_id: None,
                process_name: None,
                details: "文件不存在".to_string(),
            };
        }

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        #[cfg(target_os = "windows")]
        {
            let path_clean = file_path.to_string_lossy();
            let ps_cmd = format!(
                "Get-Process | Where-Object {{ $_.Path -eq '{}' -or $_.ProcessName -eq '{}' }} | Select-Object -First 1 Id, ProcessName | ConvertTo-Json -Compress",
                path_clean.replace("'", "''"),
                file_name.trim_end_matches(".exe")
            );

            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
                .output()
            {
                if output.status.success() {
                    let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&out_str) {
                        if let Some(pid) = val.get("Id").and_then(|v| v.as_u64()) {
                            let pname = val
                                .get("ProcessName")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&file_name)
                                .to_string();
                            return ProcessAssociation {
                                is_running: true,
                                process_id: Some(pid as u32),
                                process_name: Some(pname),
                                details: format!("主进程正在运行 (PID: {})", pid),
                            };
                        }
                    }
                }
            }
        }

        ProcessAssociation {
            is_running: false,
            process_id: None,
            process_name: None,
            details: "未检测到关联活动进程 (Read-only check)".to_string(),
        }
    }

    /// Calculate SHA-256 hash on-demand with duration and size checks
    pub fn calculate_sha256(file_path: &Path) -> Result<HashResult, String> {
        if !file_path.exists() {
            return Err("文件不存在或已被移动".to_string());
        }

        let start = Instant::now();
        let mut file = File::open(file_path).map_err(|e| format!("无法读取文件: {}", e))?;
        let metadata = file.metadata().map_err(|e| format!("无法获取元数据: {}", e))?;
        let file_size = metadata.len();

        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536]; // 64 KB buffer
        loop {
            let count = file.read(&mut buffer).map_err(|e| format!("读取失败: {}", e))?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
        }

        let hash_bytes = hasher.finalize();
        let hash_hex = format!("{:x}", hash_bytes);
        let elapsed = start.elapsed().as_millis() as u64;

        Ok(HashResult {
            algorithm: "SHA-256".to_string(),
            hash: hash_hex,
            file_size_bytes: file_size,
            calculation_time_ms: elapsed,
            calculated_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        })
    }

    /// Perform comprehensive Multi-Signal Security Assessment for a file or application
    pub fn assess_file_security(file_path: &Path, publisher_hint: Option<&str>) -> SecurityAssessment {
        let path_str = file_path.to_string_lossy().to_string();
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("未知文件")
            .to_string();

        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let path_classification = Self::classify_path(&path_str);
        let is_exec_script = Self::is_executable_or_script(&ext);
        let is_protected = path_classification == PathClassification::SystemProtected;

        // 1. Digital signature analysis
        let signature = Self::inspect_digital_signature(file_path);

        // 2. Publisher correlation
        let mut correlation_status = "unknown".to_string();
        let mut correlation_details = "未提供登记发布商信息".to_string();
        let mut publisher_name = None;
        let mut signer_name = None;

        if let Some(pub_str) = publisher_hint {
            publisher_name = Some(pub_str.to_string());
            if let Some(ref sig_signer) = signature.signer {
                signer_name = Some(sig_signer.clone());
                let pub_norm = pub_str.to_lowercase();
                let sig_norm = sig_signer.to_lowercase();

                if pub_norm.contains("microsoft") && sig_norm.contains("microsoft")
                    || pub_norm.contains("google") && sig_norm.contains("google")
                    || pub_norm.contains("adobe") && sig_norm.contains("adobe")
                    || pub_norm.contains("mozilla") && sig_norm.contains("mozilla")
                    || pub_norm.contains("apple") && sig_norm.contains("apple")
                    || sig_norm.contains(&pub_norm)
                    || pub_norm.contains(&sig_norm)
                {
                    correlation_status = "matched".to_string();
                    correlation_details = format!("注册表登记发布商「{}」与 Authenticode 证书主体一致", pub_str);
                } else {
                    correlation_status = "discrepancy".to_string();
                    correlation_details = format!(
                        "发布商不一致警示：注册表登记为「{}」，而数字证书签名者为「{}」",
                        pub_str, sig_signer
                    );
                }
            } else {
                correlation_status = "no_signer".to_string();
                correlation_details = format!("注册表登记为「{}」，但主程序未发现有效签名", pub_str);
            }
        }

        let publisher_correlation = PublisherCorrelation {
            status: correlation_status,
            details: correlation_details,
            publisher_name,
            signer_name,
        };

        // 3. Process association
        let process_association = if is_exec_script {
            Self::check_running_process(file_path)
        } else {
            ProcessAssociation {
                is_running: false,
                process_id: None,
                process_name: None,
                details: "常规非可执行文件，无独立常驻进程".to_string(),
            }
        };

        // 4. Synthesize Multi-Signal Trust State & Explainable Reasons
        let mut signals = Vec::new();
        let mut reasons = Vec::new();
        let mut trust_state = TrustState::Unknown;

        // Collect signals
        match path_classification {
            PathClassification::SystemProtected => {
                signals.push("路径归类：Windows 系统保护目录 (System Protected)".to_string());
            }
            PathClassification::InstalledApp => {
                signals.push("路径归类：正规已安装程序目录 (Program Files / ProgramData)".to_string());
            }
            PathClassification::UserDownloads => {
                signals.push("路径归类：用户下载目录 (User Downloads 临时入口)".to_string());
            }
            PathClassification::TempOrCache => {
                signals.push("路径归类：临时缓存空间 (Temp / Cache)".to_string());
            }
            PathClassification::UserData => {
                signals.push("路径归类：用户个人数据文档目录 (User Documents/Desktop)".to_string());
            }
            PathClassification::UserAppData => {
                signals.push("路径归类：用户应用数据存储区 (AppData)".to_string());
            }
            PathClassification::ExternalOrUnknown => {
                signals.push("路径归类：自定义或外部未知位置".to_string());
            }
        }

        if is_exec_script {
            signals.push(format!("文件类型：可执行程序或脚本文件 (.{ext})"));
        } else {
            signals.push(format!("文件类型：常规数据或多媒体文件 (.{ext})"));
        }

        match signature.status {
            SignatureStatus::ValidSignature => {
                signals.push("签名状态：有效 Windows Authenticode 数字签名".to_string());
            }
            SignatureStatus::InvalidSignature => {
                signals.push("签名状态：数字签名无效、损坏或证书已失效 (Invalid Signature)".to_string());
            }
            SignatureStatus::Unsigned => {
                signals.push("签名状态：未签名可执行实体 (Unsigned)".to_string());
            }
            SignatureStatus::Unknown => {
                signals.push("签名状态：签名信息暂不可用或不支持解析".to_string());
            }
        }

        // Trust State Determination (Conservative, Non-Antivirus, Contextual)
        if !file_path.exists() {
            trust_state = TrustState::Unknown;
            reasons.push("文件在磁盘上已不存在，无法进行物理凭据审计".to_string());
        } else if is_protected {
            trust_state = TrustState::ProtectedSystem;
            reasons.push("文件位于 Windows 核心系统目录，受操作系统完整性保护机制监管。".to_string());
            if signature.status == SignatureStatus::ValidSignature {
                reasons.push("包含有效的 Microsoft 操作系统核心认证签名。".to_string());
            }
        } else if is_exec_script {
            // Executable or script logic
            if path_classification == PathClassification::TempOrCache {
                trust_state = TrustState::NeedsReview;
                reasons.push("可执行文件或脚本位于 Temp 临时目录，属于常见高风险落地路径，建议谨慎核实。".to_string());
                if signature.status == SignatureStatus::Unsigned {
                    trust_state = TrustState::HighRisk;
                    reasons.push("临时目录中运行的未签名程序，缺乏有效开发者凭据。".to_string());
                }
            } else if path_classification == PathClassification::UserDownloads {
                if signature.status == SignatureStatus::ValidSignature {
                    trust_state = TrustState::LowRisk;
                    reasons.push("位于下载目录的可执行文件，但具有有效的第三方机构数字签名。".to_string());
                } else if signature.status == SignatureStatus::InvalidSignature {
                    trust_state = TrustState::HighRisk;
                    reasons.push("下载目录中的程序签名损坏或证书不匹配，存在安全风险。".to_string());
                } else {
                    trust_state = TrustState::NeedsReview;
                    reasons.push("位于下载目录的未签名可执行程序，来源未经过 Authenticode 官方认证。".to_string());
                }
            } else if publisher_correlation.status == "discrepancy" {
                trust_state = TrustState::NeedsReview;
                reasons.push("软件注册表记录的发布商与二进制文件签名主体不一致，需人工核对。".to_string());
            } else if signature.status == SignatureStatus::ValidSignature {
                trust_state = TrustState::Trusted;
                reasons.push("位于标准程序部署目录，并具有完整、可验证的企业数字签名。".to_string());
            } else {
                trust_state = TrustState::NeedsReview;
                reasons.push("可执行文件虽位于应用目录，但未发现有效企业代码签名。".to_string());
            }
        } else {
            // Standard data files (documents, images, videos, audio, text)
            if path_classification == PathClassification::UserData || path_classification == PathClassification::InstalledApp {
                trust_state = TrustState::LowRisk;
                reasons.push("常规非可执行数据文件，无独立指令执行能力，位于正常用户工作空间。".to_string());
            } else if path_classification == PathClassification::TempOrCache {
                trust_state = TrustState::LowRisk;
                reasons.push("临时数据缓存文件，可按需清理。".to_string());
            } else {
                trust_state = TrustState::LowRisk;
                reasons.push("用户常规数据，无直接系统级风险。".to_string());
            }
        }

        SecurityAssessment {
            target_id: uuid::Uuid::new_v4().to_string(),
            target_name: file_name,
            target_path: path_str,
            trust_state,
            path_classification,
            file_category: if is_exec_script { "可执行/脚本".to_string() } else { "常规数据".to_string() },
            is_executable_or_script: is_exec_script,
            is_protected,
            signature,
            publisher_correlation,
            process_association,
            signals,
            reasons,
            assessed_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }

    /// Assess installed software security & trust
    pub fn assess_software_security(software: &SoftwareRecord) -> SecurityAssessment {
        let install_path = software
            .install_location
            .as_deref()
            .or(software.main_exe_path.as_deref())
            .unwrap_or("");

        let target_path = if !install_path.is_empty() {
            PathBuf::from(install_path)
        } else {
            PathBuf::from(&software.display_name)
        };

        // If main_exe_path exists, use it directly for binary evaluation
        let eval_path = if let Some(ref exe) = software.main_exe_path {
            PathBuf::from(exe)
        } else if target_path.is_file() {
            target_path.clone()
        } else if target_path.is_dir() {
            // Find primary exe inside
            let mut found_exe = target_path.clone();
            if let Ok(entries) = fs::read_dir(&target_path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() && p.extension().and_then(|e| e.to_str()).unwrap_or("") == "exe" {
                        found_exe = p;
                        break;
                    }
                }
            }
            found_exe
        } else {
            target_path.clone()
        };

        let mut assessment = Self::assess_file_security(&eval_path, software.publisher.as_deref());
        assessment.target_name = software.display_name.clone();
        assessment.target_id = software.id.clone();

        assessment
    }
}
