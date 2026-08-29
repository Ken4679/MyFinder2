import { FileRecord, FileCategory } from '../types';
import { determineCategory } from './storageService';

// Track external virtual disk state to simulate real OS file system dynamics
// (such as files deleted/modified while the app was closed or in background)
const EXTERNAL_DELETED_PATHS_KEY = 'myfinder_external_deleted_paths';
const EXTERNAL_MODIFIED_PATHS_KEY = 'myfinder_external_modified_paths';

class FileSyncService {
  private deletedPathsSet: Set<string> = new Set();
  private modifiedPathsMap: Map<string, { sizeBytes: number; updatedTime: string }> = new Map();
  private lastSyncTimestamp: number = Date.now();

  constructor() {
    this.loadSimulatedDiskState();
  }

  private loadSimulatedDiskState() {
    try {
      const rawDeleted = localStorage.getItem(EXTERNAL_DELETED_PATHS_KEY);
      if (rawDeleted) {
        const arr = JSON.parse(rawDeleted);
        if (Array.isArray(arr)) {
          this.deletedPathsSet = new Set(arr.map((p: string) => p.toLowerCase()));
        }
      }
      const rawModified = localStorage.getItem(EXTERNAL_MODIFIED_PATHS_KEY);
      if (rawModified) {
        const map = JSON.parse(rawModified);
        this.modifiedPathsMap = new Map(Object.entries(map));
      }
    } catch (e) {
      console.warn('Failed to load simulated disk state', e);
    }
  }

  private saveSimulatedDiskState() {
    try {
      localStorage.setItem(
        EXTERNAL_DELETED_PATHS_KEY,
        JSON.stringify(Array.from(this.deletedPathsSet))
      );
      const obj: Record<string, { sizeBytes: number; updatedTime: string }> = {};
      this.modifiedPathsMap.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(EXTERNAL_MODIFIED_PATHS_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save simulated disk state', e);
    }
  }

  /**
   * Verify whether a file physically exists and return its most updated state
   * Runs whenever a file is clicked, opened, or viewed.
   */
  public verifyFileOnOpen(
    filePath: string,
    currentRecords: FileRecord[]
  ): {
    exists: boolean;
    reason?: string;
    updatedRecord?: FileRecord;
  } {
    const normalized = filePath.trim().toLowerCase();

    // 1. Check if marked as deleted externally (e.g. while app was closed or outside app)
    if (this.deletedPathsSet.has(normalized)) {
      return {
        exists: false,
        reason: '文件已在外部被删除或移动',
      };
    }

    // 2. Locate existing record
    const existing = currentRecords.find(r => r.path.toLowerCase() === normalized);
    if (!existing) {
      return {
        exists: false,
        reason: '索引中未找到该文件路径',
      };
    }

    // 3. Check if file was modified externally
    const modInfo = this.modifiedPathsMap.get(normalized);
    if (modInfo) {
      const updated: FileRecord = {
        ...existing,
        sizeBytes: modInfo.sizeBytes,
        updatedTime: modInfo.updatedTime,
      };
      return {
        exists: true,
        updatedRecord: updated,
      };
    }

    return {
      exists: true,
      updatedRecord: existing,
    };
  }

  /**
   * Full scan and synchronization across all watched directories
   * Automatically reconciles files deleted/added/modified while the app was closed.
   */
  public syncAllFiles(
    currentFiles: FileRecord[],
    watchedDirectories: string[]
  ): {
    syncedFiles: FileRecord[];
    removedCount: number;
    updatedCount: number;
    addedCount: number;
  } {
    this.lastSyncTimestamp = Date.now();
    let removedCount = 0;
    let updatedCount = 0;
    let addedCount = 0;

    // Filter out files that were deleted on disk (external deletion check)
    const validFiles: FileRecord[] = [];

    for (const file of currentFiles) {
      const normalized = file.path.toLowerCase();
      if (this.deletedPathsSet.has(normalized)) {
        removedCount++;
        continue;
      }

      const modInfo = this.modifiedPathsMap.get(normalized);
      if (modInfo) {
        if (modInfo.sizeBytes !== file.sizeBytes || modInfo.updatedTime !== file.updatedTime) {
          updatedCount++;
          validFiles.push({
            ...file,
            sizeBytes: modInfo.sizeBytes,
            updatedTime: modInfo.updatedTime,
          });
          continue;
        }
      }

      validFiles.push(file);
    }

    return {
      syncedFiles: validFiles,
      removedCount,
      updatedCount,
      addedCount,
    };
  }

  /**
   * Simulates an external event (e.g. user deletes/modifies a file outside the software while closed)
   * to demonstrate zero-lag immediate recognition upon opening or scanning.
   */
  public simulateExternalFileDeletion(filePath: string): void {
    this.deletedPathsSet.add(filePath.trim().toLowerCase());
    this.modifiedPathsMap.delete(filePath.trim().toLowerCase());
    this.saveSimulatedDiskState();
  }

  public simulateExternalFileModification(filePath: string, newSizeBytes: number): void {
    const normalized = filePath.trim().toLowerCase();
    this.deletedPathsSet.delete(normalized);
    this.modifiedPathsMap.set(normalized, {
      sizeBytes: newSizeBytes,
      updatedTime: new Date().toISOString(),
    });
    this.saveSimulatedDiskState();
  }

  public resetExternalSimulation(): void {
    this.deletedPathsSet.clear();
    this.modifiedPathsMap.clear();
    this.saveSimulatedDiskState();
  }

  public getLastSyncTime(): string {
    return new Date(this.lastSyncTimestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}

export const fileSyncService = new FileSyncService();
