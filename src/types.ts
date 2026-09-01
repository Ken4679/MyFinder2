export enum FileCategory {
  Other = 0,
  Document = 1,
  Image = 2,
  Audio = 3,
  Video = 4,
  Executable = 5,
  Config = 6,
  Temp = 7,
  Archive = 8
}

export interface FileRecord {
  id: string;
  path: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  category: FileCategory;
  createdTime: string;
  updatedTime: string;
  contentSnippet?: string;
}

export interface SoftwareRecord {
  id: string;
  displayName: string;
  publisher?: string | null;
  version?: string | null;
  installLocation?: string | null;
  installDate?: string | null;
  architecture?: string | null;
  uninstallCommand?: string | null;
  quietUninstallCommand?: string | null;
  estimatedSize?: number | null;
  source: string;
  registryKey?: string | null;
  packageFamily?: string | null;
  displayIcon?: string | null;
  mainExePath?: string | null;
  isSigned?: boolean;
  signerName?: string | null;
  createdTime?: string;
  updatedTime?: string;
}

export interface FavoriteRecord {
  id: string;
  targetPath: string;
  targetType: number; // 0 = file, 1 = folder
  displayAlias: string;
  createdTime: string;
  updatedTime: string;
}

export interface TreeNodeModel {
  id: string;
  name: string;
  fullPath: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  isLoaded?: boolean;
  children?: TreeNodeModel[];
  category?: FileCategory;
  sizeBytes?: number;
  updatedTime?: string;
}

export interface NaturalLanguageQueryResult {
  originalQuery: string;
  isNaturalLanguage: boolean;
  extractedSearchText: string;
  parsedDescription: string;
  startDate?: string;
  endDate?: string;
  targetCategory?: FileCategory;
}

export type ElementThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  theme: ElementThemeMode;
  autoStart: boolean;
  minimizeToTray: boolean;
  closeAction: number; // 0 = 退出程序, 1 = 最小化到托盘
  autoIndex: boolean;
  autoMonitor: boolean;
  isAiModeEnabled: boolean;
  portableMode: boolean;
  watchedDirectories: string[];
  includeSubdirectories: boolean;
}

export type FileSafetyLevel = 'safe' | 'caution' | 'danger';

export interface FileSafetyInfo {
  level: FileSafetyLevel;
  levelBadge: string;
  typeName: string;
  description: string;
  deletionSafety: string;
  openRecommendation: string;
  isSystemCritical: boolean;
  commonExamples: string[];
}

export type NavTab = 'home' | 'tree' | 'recent' | 'software' | 'favorites' | 'encyclopedia' | 'portable' | 'settings';

export interface IndexingStatus {
  state: 'idle' | 'indexing' | 'cancelling' | 'completed' | 'cancelled' | 'error';
  currentDirectory?: string;
  currentFile?: string;
  filesDiscovered: number;
  filesIndexed: number;
  filesSkipped: number;
  filesFailed?: number;
  elapsedMs: number;
  message?: string;
}

export interface IndexStats {
  totalFiles: number;
  totalSizeBytes: number;
  lastIndexedTime?: string;
  dbSizeBytes: number;
  indexedDirectories: string[];
}

export interface SearchFilterParams {
  query: string;
  category?: number;
  startDate?: string;
  endDate?: string;
  isDeepSearch?: boolean;
  limit?: number;
  offset?: number;
}

export type LeftoverItemType = 'directory' | 'file' | 'registryKey' | 'shortcut';
export type LeftoverConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type LeftoverRisk = 'safeToReview' | 'needsReview' | 'protected' | 'unknown';

export interface LeftoverCandidate {
  id: string;
  itemType: LeftoverItemType;
  path: string;
  sizeBytes?: number | null;
  confidence: LeftoverConfidence;
  risk: LeftoverRisk;
  reason: string;
  isProtected: boolean;
  recommendedSelected: boolean;
}

export interface UninstallPrecheckInfo {
  softwareId: string;
  softwareName: string;
  publisher?: string | null;
  version?: string | null;
  installLocation?: string | null;
  uninstallerType: 'msi' | 'exe' | 'none';
  uninstallerPath?: string | null;
  uninstallerExists: boolean;
  uninstallCommand?: string | null;
  isRunning: boolean;
}

export interface UninstallLaunchResult {
  success: boolean;
  processId?: number | null;
  message: string;
}

export interface CleanupPlan {
  softwareId: string;
  softwareName: string;
  items: LeftoverCandidate[];
  isDryRun: boolean;
}

export interface CleanupItemResult {
  candidateId: string;
  path: string;
  success: boolean;
  status:
    | 'removed'
    | 'skipped_in_use'
    | 'skipped_protected'
    | 'skipped_not_found'
    | 'skipped_unauthorized'
    | 'skipped_tampered'
    | 'skipped_symlink'
    | 'skipped_backup_failed'
    | 'failed'
    | 'dry_run_simulated';
  message: string;
}

export interface CleanupExecutionReport {
  softwareName: string;
  totalCandidates: number;
  removedCount: number;
  skippedCount: number;
  failedCount: number;
  results: CleanupItemResult[];
  isDryRun: boolean;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  softwareName: string;
  timestamp: string;
  action: string;
  details: string;
}

export type TrustState = 'trusted' | 'lowRisk' | 'needsReview' | 'highRisk' | 'protectedSystem' | 'unknown';
export type PathClassification =
  | 'systemProtected'
  | 'installedApp'
  | 'userData'
  | 'userDownloads'
  | 'tempOrCache'
  | 'userAppData'
  | 'externalOrUnknown';
export type SignatureStatus = 'validSignature' | 'invalidSignature' | 'unsigned' | 'unknown';

export interface DigitalSignatureInfo {
  status: SignatureStatus;
  signer?: string | null;
  issuer?: string | null;
  subject?: string | null;
  isOsComponent: boolean;
  verificationMessage: string;
}

export interface PublisherCorrelation {
  status: string; // 'matched' | 'discrepancy' | 'no_signer' | 'no_publisher' | 'unknown'
  details: string;
  publisherName?: string | null;
  signerName?: string | null;
}

export interface ProcessAssociation {
  isRunning: boolean;
  processId?: number | null;
  processName?: string | null;
  details: string;
}

export interface HashResult {
  algorithm: string;
  hash: string;
  fileSizeBytes: number;
  calculationTimeMs: number;
  calculatedAt: string;
}

export interface SecurityAssessment {
  targetId: string;
  targetName: string;
  targetPath: string;
  trustState: TrustState;
  pathClassification: PathClassification;
  fileCategory: string;
  isExecutableOrScript: boolean;
  isProtected: boolean;
  signature: DigitalSignatureInfo;
  publisherCorrelation: PublisherCorrelation;
  processAssociation: ProcessAssociation;
  signals: string[];
  reasons: string[];
  assessedAt: string;
}

export interface VolumeUsnState {
  volumePath: string;
  volumeSerial: string;
  fileSystem: string;
  journalId: number;
  lastUsn: number;
  lowestValidUsn: number;
  lastSyncTime: string;
  syncStatus: 'synced' | 'synchronizing' | 'needs_rescan' | 'partial' | 'unsupported' | 'error';
  statusMessage?: string | null;
}

export interface SyncStatusInfo {
  overallState: 'synced' | 'synchronizing' | 'needs_rescan' | 'partial' | 'error';
  activeWatcherCount: number;
  isWatching: boolean;
  lastSyncTime: string;
  volumes: VolumeUsnState[];
  changesProcessedCount: number;
  syncMethod: 'NTFS_USN_Journal' | 'Directory_Watcher' | 'Reconciliation_Scan' | string;
  message: string;
}

export interface IncrementalSyncResult {
  success: boolean;
  volumePath: string;
  methodUsed: string;
  changesDetected: number;
  createsCount: number;
  updatesCount: number;
  deletesCount: number;
  elapsedMs: number;
  newUsn: number;
  message: string;
}

export interface FileSystemChangeEvent {
  path: string;
  oldPath?: string | null;
  changeType: 'create' | 'delete' | 'rename' | 'modify';
  timestamp: string;
}


