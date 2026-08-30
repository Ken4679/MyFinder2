import { FileRecord } from '../types';
import { tauriBridge } from './tauriBridge';

/**
 * FileSyncService
 * Provides real-time synchronization and verification against the local filesystem.
 */
class FileSyncService {
  private lastSyncTimestamp: number = Date.now();

  /**
   * Verify whether a file physically exists on the disk.
   */
  public async verifyFileOnOpenAsync(
    filePath: string,
    currentRecords: FileRecord[]
  ): Promise<{
    exists: boolean;
    reason?: string;
    updatedRecord?: FileRecord;
  }> {
    if (tauriBridge.isTauri()) {
      try {
        const exists = await tauriBridge.verifyFileExists(filePath);
        if (!exists) {
          return {
            exists: false,
            reason: '文件在磁盘上已不存在（已被删除或移动）',
          };
        }
        const existing = currentRecords.find(
          r => r.path.toLowerCase() === filePath.trim().toLowerCase()
        );
        return {
          exists: true,
          updatedRecord: existing,
        };
      } catch (e) {
        console.warn('Native verify failed', e);
      }
    }

    const existing = currentRecords.find(
      r => r.path.toLowerCase() === filePath.trim().toLowerCase()
    );
    return {
      exists: Boolean(existing),
      updatedRecord: existing,
    };
  }

  /**
   * Synchronous check for UI components
   */
  public verifyFileOnOpen(
    filePath: string,
    currentRecords: FileRecord[]
  ): {
    exists: boolean;
    reason?: string;
    updatedRecord?: FileRecord;
  } {
    const existing = currentRecords.find(
      r => r.path.toLowerCase() === filePath.trim().toLowerCase()
    );
    return {
      exists: Boolean(existing),
      reason: existing ? undefined : '索引中未找到该文件路径',
      updatedRecord: existing,
    };
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
