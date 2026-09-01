import {
  AuditLogEntry,
  FileRecord,
  HashResult,
  IncrementalSyncResult,
  IndexingStatus,
  IndexStats,
  LeftoverCandidate,
  SearchFilterParams,
  SecurityAssessment,
  SoftwareRecord,
  SyncStatusInfo,
  UninstallPrecheckInfo,
  VolumeUsnState,
} from '../types';

// Check if running inside native Tauri runtime environment
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    Boolean((window as unknown as { isTauri?: boolean }).isTauri)
  );
}

// Dynamically invoke Tauri IPC commands safely
async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    throw new Error(`Tauri environment not detected for command: ${cmd}`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const tauriBridge = {
  isTauri: isTauriEnvironment,

  async startIndexing(targetPath: string, recursive: boolean = true): Promise<string> {
    if (isTauriEnvironment()) {
      return invokeTauri<string>('start_indexing', {
        targetPath,
        recursive,
      });
    }
    return `[Web Preview] 模拟启动索引: ${targetPath}`;
  },

  async cancelIndexing(): Promise<boolean> {
    if (isTauriEnvironment()) {
      return invokeTauri<boolean>('cancel_indexing');
    }
    return true;
  },

  async getIndexingStatus(): Promise<IndexingStatus> {
    if (isTauriEnvironment()) {
      return invokeTauri<IndexingStatus>('get_indexing_status');
    }
    return {
      state: 'idle',
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      elapsedMs: 0,
    };
  },

  async searchFiles(params: SearchFilterParams): Promise<FileRecord[]> {
    if (isTauriEnvironment()) {
      return invokeTauri<FileRecord[]>('search_files', {
        filter: {
          query: params.query,
          category: params.category,
          startDate: params.startDate,
          endDate: params.endDate,
          isDeepSearch: params.isDeepSearch ?? false,
          limit: params.limit,
          offset: params.offset,
        },
      });
    }
    return [];
  },

  async getIndexedFiles(limit: number = 100, offset: number = 0): Promise<FileRecord[]> {
    if (isTauriEnvironment()) {
      return invokeTauri<FileRecord[]>('get_indexed_files', { limit, offset });
    }
    return [];
  },

  async getIndexStats(): Promise<IndexStats> {
    if (isTauriEnvironment()) {
      return invokeTauri<IndexStats>('get_index_stats');
    }
    return {
      totalFiles: 0,
      totalSizeBytes: 0,
      dbSizeBytes: 0,
      indexedDirectories: [],
    };
  },

  async removeDirectoryFromIndex(dirPath: string): Promise<number> {
    if (isTauriEnvironment()) {
      return invokeTauri<number>('remove_directory_from_index', { dirPath });
    }
    return 0;
  },

  async optimizeDatabase(): Promise<void> {
    if (isTauriEnvironment()) {
      return invokeTauri<void>('optimize_database');
    }
  },

  async wipeIndex(): Promise<void> {
    if (isTauriEnvironment()) {
      return invokeTauri<void>('wipe_index');
    }
  },

  async verifyFileExists(filePath: string): Promise<boolean> {
    if (isTauriEnvironment()) {
      return invokeTauri<boolean>('verify_file_exists', { filePath });
    }
    return true;
  },

  async openFileNative(filePath: string): Promise<void> {
    if (isTauriEnvironment()) {
      return invokeTauri<void>('open_file_native', { filePath });
    }
  },

  async revealInExplorerNative(filePath: string): Promise<void> {
    if (isTauriEnvironment()) {
      return invokeTauri<void>('reveal_in_explorer_native', { filePath });
    }
  },

  async openFolderNative(folderPath: string): Promise<void> {
    if (isTauriEnvironment()) {
      return invokeTauri<void>('open_folder_native', { folderPath });
    }
  },

  async scanInstalledSoftware(): Promise<SoftwareRecord[]> {
    if (isTauriEnvironment()) {
      return invokeTauri<SoftwareRecord[]>('scan_installed_software');
    }
    return [];
  },

  async precheckSoftwareUninstall(software: SoftwareRecord): Promise<UninstallPrecheckInfo> {
    if (isTauriEnvironment()) {
      return invokeTauri<UninstallPrecheckInfo>('precheck_software_uninstall', { software });
    }
    // Fallback for browser preview
    return {
      softwareId: software.id,
      softwareName: software.displayName,
      publisher: software.publisher,
      version: software.version,
      installLocation: software.installLocation,
      uninstallerType: (software.uninstallCommand?.toLowerCase().includes('msiexec') ? 'msi' : 'exe') as 'msi' | 'exe',
      uninstallerPath: software.uninstallCommand ? software.uninstallCommand.replace(/"/g, '').split(' ')[0] : null,
      uninstallerExists: true,
      uninstallCommand: software.uninstallCommand,
      isRunning: false,
    };
  },

  async detectSoftwareLeftovers(software: SoftwareRecord): Promise<LeftoverCandidate[]> {
    if (isTauriEnvironment()) {
      return invokeTauri<LeftoverCandidate[]>('detect_software_leftovers', { software });
    }
    // Preview mode: generate realistic explainable leftover candidates based on software record
    const candidates: LeftoverCandidate[] = [];
    if (software.installLocation) {
      candidates.push({
        id: 'cand-install-dir',
        itemType: 'directory',
        path: software.installLocation,
        sizeBytes: software.estimatedSize || 45000000,
        confidence: 'high',
        risk: 'safeToReview',
        reason: '匹配注册表记录的官方完整安装目录 (Matches registered install location)',
        isProtected: false,
        recommendedSelected: true,
      });
    }
    if (software.publisher) {
      candidates.push({
        id: 'cand-appdata-dir',
        itemType: 'directory',
        path: `C:\\Users\\User\\AppData\\Roaming\\${software.publisher}\\${software.displayName}`,
        sizeBytes: 14500000,
        confidence: 'high',
        risk: 'safeToReview',
        reason: `匹配「${software.publisher}\\${software.displayName}」专属应用配置与缓存目录`,
        isProtected: false,
        recommendedSelected: true,
      });
    }
    candidates.push({
      id: 'cand-desktop-lnk',
      itemType: 'shortcut',
      path: `C:\\Users\\User\\Desktop\\${software.displayName}.lnk`,
      sizeBytes: 1420,
      confidence: 'high',
      risk: 'safeToReview',
      reason: `匹配「${software.displayName}」的桌面快捷方式`,
      isProtected: false,
      recommendedSelected: true,
    });
    candidates.push({
      id: 'cand-startmenu-lnk',
      itemType: 'shortcut',
      path: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${software.displayName}.lnk`,
      sizeBytes: 2048,
      confidence: 'high',
      risk: 'safeToReview',
      reason: `匹配「${software.displayName}」的公共开始菜单启动项`,
      isProtected: false,
      recommendedSelected: true,
    });
    if (software.registryKey) {
      candidates.push({
        id: 'cand-reg-uninstall',
        itemType: 'registryKey',
        path: `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${software.registryKey}`,
        sizeBytes: null,
        confidence: 'high',
        risk: 'safeToReview',
        reason: '卸载后残留的 Windows 软件注册表卸载登记项 (Orphaned Uninstall Registry Entry)',
        isProtected: false,
        recommendedSelected: true,
      });
    }
    return candidates;
  },

  async readUninstallAuditLogs(): Promise<AuditLogEntry[]> {
    if (isTauriEnvironment()) {
      return invokeTauri<AuditLogEntry[]>('read_uninstall_audit_logs');
    }
    return [];
  },

  async inspectFileSecurity(filePath: string): Promise<SecurityAssessment> {
    if (isTauriEnvironment()) {
      return invokeTauri<SecurityAssessment>('inspect_file_security', { filePath });
    }
    // Realistic simulated security assessment for browser preview
    const lower = filePath.toLowerCase();
    const isExe = lower.endsWith('.exe') || lower.endsWith('.msi') || lower.endsWith('.bat') || lower.endsWith('.ps1');
    const isSys = lower.includes('windows') || lower.includes('system32');
    const isDownloads = lower.includes('downloads');
    const isTemp = lower.includes('temp');

    let trustState: any = 'unknown';
    let pathClassification: any = 'userData';
    const reasons: string[] = [];
    const signals: string[] = [];

    if (isSys) {
      pathClassification = 'systemProtected';
      trustState = 'protectedSystem';
      signals.push('路径归类：Windows 系统保护目录 (System Protected)');
      reasons.push('文件位于 Windows 核心系统目录，受操作系统完整性保护机制监管。');
      reasons.push('包含有效的 Microsoft 操作系统核心认证签名。');
    } else if (isTemp) {
      pathClassification = 'tempOrCache';
      trustState = isExe ? 'needsReview' : 'lowRisk';
      signals.push('路径归类：临时缓存空间 (Temp / Cache)');
      if (isExe) {
        reasons.push('可执行文件或脚本位于 Temp 临时目录，属于常见高风险落地路径，建议谨慎核实。');
      } else {
        reasons.push('临时数据缓存文件，无独立指令执行能力。');
      }
    } else if (isDownloads) {
      pathClassification = 'userDownloads';
      trustState = isExe ? 'needsReview' : 'lowRisk';
      signals.push('路径归类：用户下载目录 (User Downloads 临时入口)');
      if (isExe) {
        reasons.push('位于下载目录的可执行文件，来源未经过企业 Authenticode 官方认证。');
      } else {
        reasons.push('下载的用户常规数据文件，无独立指令执行能力。');
      }
    } else {
      pathClassification = 'installedApp';
      trustState = isExe ? 'trusted' : 'lowRisk';
      signals.push('路径归类：正规已安装程序或用户工作区');
      reasons.push('位于标准程序部署目录，并具有完整、可验证的企业数字签名。');
    }

    return {
      targetId: 'preview-sec-' + Date.now(),
      targetName: filePath.split(/[/\\]/).pop() || filePath,
      targetPath: filePath,
      trustState,
      pathClassification,
      fileCategory: isExe ? '可执行/脚本' : '常规数据',
      isExecutableOrScript: isExe,
      isProtected: isSys,
      signature: {
        status: isSys || (!isDownloads && isExe) ? 'validSignature' : isExe ? 'unsigned' : 'unsigned',
        signer: isSys ? 'CN=Microsoft Windows, O=Microsoft Corporation' : isExe ? 'CN=Verified Software Vendor LLC' : null,
        issuer: isSys ? 'CN=Microsoft Root Certificate Authority 2010' : isExe ? 'CN=DigiCert Trusted Root G4' : null,
        subject: null,
        isOsComponent: isSys,
        verificationMessage: isSys
          ? '数字签名有效 (Microsoft 操作系统受信任组件)'
          : isExe
          ? '数字签名有效 (已验证企业发布商证书)'
          : '常规数据文件类型，无独立执行签名需求',
      },
      publisherCorrelation: {
        status: 'matched',
        details: '软件注册表记录与文件证书主体一致',
        publisherName: isSys ? 'Microsoft Corporation' : 'Verified Vendor',
        signerName: isSys ? 'Microsoft Corporation' : 'Verified Vendor',
      },
      processAssociation: {
        isRunning: false,
        processId: null,
        processName: null,
        details: '未检测到关联活动进程 (Read-only check)',
      },
      signals,
      reasons,
      assessedAt: new Date().toLocaleString(),
    };
  },

  async inspectSoftwareSecurity(software: SoftwareRecord): Promise<SecurityAssessment> {
    if (isTauriEnvironment()) {
      return invokeTauri<SecurityAssessment>('inspect_software_security', { software });
    }
    const evalPath = software.installLocation || software.mainExePath || `C:\\Program Files\\${software.displayName}\\${software.displayName}.exe`;
    const res = await this.inspectFileSecurity(evalPath);
    res.targetName = software.displayName;
    res.targetId = software.id;
    return res;
  },

  async calculateFileHash(filePath: string): Promise<HashResult> {
    if (isTauriEnvironment()) {
      return invokeTauri<HashResult>('calculate_file_hash', { filePath });
    }
    // Browser simulated SHA-256
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    }
    return {
      algorithm: 'SHA-256',
      hash: hash,
      fileSizeBytes: 4529012,
      calculationTimeMs: 14,
      calculatedAt: new Date().toLocaleString(),
    };
  },

  async getSyncStatus(): Promise<SyncStatusInfo> {
    if (isTauriEnvironment()) {
      return invokeTauri<SyncStatusInfo>('get_sync_status');
    }
    // Web simulated sync status
    return {
      overallState: 'synced',
      activeWatcherCount: 1,
      isWatching: true,
      lastSyncTime: new Date().toLocaleString(),
      volumes: [
        {
          volumePath: 'C:',
          volumeSerial: '8A4F102B',
          fileSystem: 'NTFS',
          journalId: 0x1d9f80214a,
          lastUsn: 284910248,
          lowestValidUsn: 1048576,
          lastSyncTime: new Date().toLocaleString(),
          syncStatus: 'synced',
          statusMessage: 'NTFS USN Change Journal 保持实时极速增量同步',
        },
        {
          volumePath: 'D:',
          volumeSerial: '3C9E4211',
          fileSystem: 'NTFS',
          journalId: 0x0f21a008c2,
          lastUsn: 15920194,
          lowestValidUsn: 524288,
          lastSyncTime: new Date().toLocaleString(),
          syncStatus: 'synced',
          statusMessage: '卷已对齐',
        },
      ],
      changesProcessedCount: 42,
      syncMethod: 'NTFS_USN_Journal',
      message: 'NTFS USN 日志极速对齐完成，无需后台常驻进程',
    };
  },

  async triggerIncrementalSync(
    volumeOrDir?: string,
    forceReconciliation?: boolean
  ): Promise<IncrementalSyncResult> {
    if (isTauriEnvironment()) {
      return invokeTauri<IncrementalSyncResult>('trigger_incremental_sync', {
        volumeOrDir,
        forceReconciliation,
      });
    }
    // Web simulated incremental sync
    return {
      success: true,
      volumePath: volumeOrDir || 'C:',
      methodUsed: forceReconciliation ? 'Reconciliation_Scan' : 'NTFS_USN_Journal',
      changesDetected: 3,
      createsCount: 2,
      updatesCount: 1,
      deletesCount: 0,
      elapsedMs: 8,
      newUsn: 284910384,
      message: forceReconciliation
        ? '已完成高频目录树时间戳快速核验'
        : '通过 NTFS USN Change Journal 极速同步 3 个文件变动 (8ms)',
    };
  },

  async startFsWatcher(): Promise<boolean> {
    if (isTauriEnvironment()) {
      return invokeTauri<boolean>('start_fs_watcher');
    }
    return true;
  },

  async stopFsWatcher(): Promise<boolean> {
    if (isTauriEnvironment()) {
      return invokeTauri<boolean>('stop_fs_watcher');
    }
    return true;
  },
};
