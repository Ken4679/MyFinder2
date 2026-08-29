import { AppSettings, FavoriteRecord, FileCategory, FileRecord } from '../types';

export function determineCategory(extension: string): FileCategory {
  if (!extension) return FileCategory.Other;
  const ext = extension.trim().toLowerCase();

  switch (ext) {
    case '.doc':
    case '.docx':
    case '.xls':
    case '.xlsx':
    case '.ppt':
    case '.pptx':
    case '.pdf':
    case '.txt':
    case '.md':
    case '.rtf':
      return FileCategory.Document;

    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.bmp':
    case '.tiff':
    case '.svg':
    case '.webp':
    case '.ico':
      return FileCategory.Image;

    case '.mp3':
    case '.wav':
    case '.flac':
    case '.aac':
    case '.ogg':
    case '.m4a':
    case '.wma':
      return FileCategory.Audio;

    case '.mp4':
    case '.avi':
    case '.mkv':
    case '.mov':
    case '.wmv':
    case '.flv':
    case '.webm':
      return FileCategory.Video;

    case '.exe':
    case '.msi':
    case '.cmd':
    case '.bat':
    case '.dll':
    case '.sys':
    case '.ps1':
    case '.vbs':
      return FileCategory.Executable;

    case '.json':
    case '.xml':
    case '.ini':
    case '.cfg':
    case '.yaml':
    case '.yml':
    case '.toml':
    case '.config':
      return FileCategory.Config;

    case '.tmp':
    case '.log':
    case '.bak':
    case '.old':
    case '.chk':
      return FileCategory.Temp;

    default:
      return FileCategory.Other;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const SETTINGS_KEY = 'myfinder_settings';
const FAVORITES_KEY = 'myfinder_favorites';
const FILES_KEY = 'myfinder_files';

export const defaultSettings: AppSettings = {
  theme: 'system',
  autoStart: true,
  minimizeToTray: true,
  closeAction: 1, // 0 = exit, 1 = minimize to tray
  autoIndex: true,
  autoMonitor: true,
  isAiModeEnabled: true,
  portableMode: true, // Permanent 100% portable green architecture
  watchedDirectories: [
    'C:\\Users\\Admin\\Documents',
    'C:\\Users\\Admin\\Desktop',
    'C:\\Users\\Admin\\Downloads',
    'C:\\Projects\\MyFinder',
  ],
  includeSubdirectories: true,
};

export const defaultSeedFiles: FileRecord[] = [
  {
    id: 'f-1',
    path: 'C:\\Users\\Admin\\Documents\\2025年产品规划及架构设计.docx',
    fileName: '2025年产品规划及架构设计.docx',
    extension: '.docx',
    sizeBytes: 1542000,
    category: FileCategory.Document,
    createdTime: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 4).toISOString(),
    contentSnippet: 'MyFinder 2.0 架构升级方案，涵盖 SQLite FTS5 本地全文索引、WinUI 3 Fluent 界面与语义搜索组件。',
  },
  {
    id: 'f-2',
    path: 'C:\\Users\\Admin\\Documents\\财务收支与年度预算分析.xlsx',
    fileName: '财务收支与年度预算分析.xlsx',
    extension: '.xlsx',
    sizeBytes: 3280000,
    category: FileCategory.Document,
    createdTime: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 12).toISOString(),
    contentSnippet: 'Q1-Q4 研发支出预算明细、服务器托管与云端部署成本核算。',
  },
  {
    id: 'f-3',
    path: 'C:\\Users\\Admin\\Documents\\API开发规范与接口清单.pdf',
    fileName: 'API开发规范与接口清单.pdf',
    extension: '.pdf',
    sizeBytes: 4890000,
    category: FileCategory.Document,
    createdTime: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 48).toISOString(),
    contentSnippet: 'RESTful API 响应标准、RPC 数据交互规范及安全加密审计接口定义。',
  },
  {
    id: 'f-4',
    path: 'C:\\Users\\Admin\\Desktop\\项目发布海报_4K.png',
    fileName: '项目发布海报_4K.png',
    extension: '.png',
    sizeBytes: 8940000,
    category: FileCategory.Image,
    createdTime: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'f-5',
    path: 'C:\\Users\\Admin\\Desktop\\系统架构拓扑图.svg',
    fileName: '系统架构拓扑图.svg',
    extension: '.svg',
    sizeBytes: 254000,
    category: FileCategory.Image,
    createdTime: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 15).toISOString(),
  },
  {
    id: 'f-6',
    path: 'C:\\Users\\Admin\\Desktop\\客户需求调研问卷汇总.md',
    fileName: '客户需求调研问卷汇总.md',
    extension: '.md',
    sizeBytes: 45000,
    category: FileCategory.Document,
    createdTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 6).toISOString(),
    contentSnippet: '# 需求调研总结\n用户对秒级快速查找大容量文件的响应速度及便携模式给予了高度评价。',
  },
  {
    id: 'f-7',
    path: 'C:\\Users\\Admin\\Downloads\\Node-v22.14.0-x64.msi',
    fileName: 'Node-v22.14.0-x64.msi',
    extension: '.msi',
    sizeBytes: 32500000,
    category: FileCategory.Executable,
    createdTime: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
  },
  {
    id: 'f-8',
    path: 'C:\\Users\\Admin\\Downloads\\MyFinder_Setup_v2.0.exe',
    fileName: 'MyFinder_Setup_v2.0.exe',
    extension: '.exe',
    sizeBytes: 18400000,
    category: FileCategory.Executable,
    createdTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'f-9',
    path: 'C:\\Users\\Admin\\Downloads\\产品演示视频_1080P.mp4',
    fileName: '产品演示视频_1080P.mp4',
    extension: '.mp4',
    sizeBytes: 68400000,
    category: FileCategory.Video,
    createdTime: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
  {
    id: 'f-10',
    path: 'C:\\Users\\Admin\\Downloads\\提示音效_通知.wav',
    fileName: '提示音效_通知.wav',
    extension: '.wav',
    sizeBytes: 350000,
    category: FileCategory.Audio,
    createdTime: new Date(Date.now() - 3600000 * 24 * 8).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 24 * 8).toISOString(),
  },
  {
    id: 'f-11',
    path: 'C:\\Projects\\MyFinder\\appsettings.json',
    fileName: 'appsettings.json',
    extension: '.json',
    sizeBytes: 12000,
    category: FileCategory.Config,
    createdTime: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 20).toISOString(),
    contentSnippet: '{\n  "Database": { "Mode": "WAL", "CacheSize": 4096 },\n  "Index": { "ThrottleMs": 50 }\n}',
  },
  {
    id: 'f-12',
    path: 'C:\\Projects\\MyFinder\\BuildLogs_202508.log',
    fileName: 'BuildLogs_202508.log',
    extension: '.log',
    sizeBytes: 89000,
    category: FileCategory.Temp,
    createdTime: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 1).toISOString(),
    contentSnippet: '[INFO] 2025-08-28 14:32:10 Build succeeded with 0 warnings, 0 errors.',
  },
  {
    id: 'f-13',
    path: 'C:\\Projects\\MyFinder\\SearchEngine.cs',
    fileName: 'SearchEngine.cs',
    extension: '.cs',
    sizeBytes: 18400,
    category: FileCategory.Document,
    createdTime: new Date(Date.now() - 3600000 * 24 * 15).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 8).toISOString(),
    contentSnippet: 'public class SearchEngine : ISearchEngine { public async Task<IEnumerable<FileRecord>> SearchFilesAsync(...) }',
  }
];

export const defaultFavorites: FavoriteRecord[] = [
  {
    id: 'fav-1',
    targetPath: 'C:\\Users\\Admin\\Documents\\2025年产品规划及架构设计.docx',
    targetType: 0,
    displayAlias: '2025年产品规划及架构设计.docx',
    createdTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'fav-2',
    targetPath: 'C:\\Projects\\MyFinder',
    targetType: 1,
    displayAlias: 'MyFinder 核心工程目录',
    createdTime: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
  {
    id: 'fav-3',
    targetPath: 'C:\\Users\\Admin\\Desktop\\项目发布海报_4K.png',
    targetType: 0,
    displayAlias: '发布海报_4K.png',
    createdTime: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedTime: new Date(Date.now() - 3600000 * 12).toISOString(),
  }
];

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to load settings from storage', e);
  }
  return defaultSettings;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings to storage', e);
  }
}

export function loadFavorites(): FavoriteRecord[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load favorites from storage', e);
  }
  return defaultFavorites;
}

export function saveFavorites(favs: FavoriteRecord[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch (e) {
    console.warn('Failed to save favorites to storage', e);
  }
}

export function loadFiles(): FileRecord[] {
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load files from storage', e);
  }
  return defaultSeedFiles;
}

export function saveFiles(files: FileRecord[]): void {
  try {
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn('Failed to save files to storage', e);
  }
}
