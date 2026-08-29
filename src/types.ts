export enum FileCategory {
  Other = 0,
  Document = 1,
  Image = 2,
  Audio = 3,
  Video = 4,
  Executable = 5,
  Config = 6,
  Temp = 7
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
  publisher: string;
  version: string;
  installLocation: string;
  mainExePath: string;
  isSigned: boolean;
  signerName: string;
  createdTime: string;
  updatedTime: string;
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
