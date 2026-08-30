import { AppSettings, FavoriteRecord, FileCategory, FileRecord } from '../types';
import { initialSeedFiles, initialFavorites } from '../fixtures/sampleData';

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
    'D:\\Documents',
    'D:\\Workspace',
    'D:\\Downloads',
    'D:\\Projects\\MyFinder',
  ],
  includeSubdirectories: true,
};

export const defaultSeedFiles: FileRecord[] = initialSeedFiles;
export const defaultFavorites: FavoriteRecord[] = initialFavorites;

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
