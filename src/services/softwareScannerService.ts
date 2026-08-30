import { SoftwareRecord } from '../types';
import { initialSoftwareCatalog } from '../fixtures/sampleData';
import { tauriBridge } from './tauriBridge';

export const previewSoftwareCatalog: SoftwareRecord[] = initialSoftwareCatalog;

/**
 * Discovers installed software from the Windows Registry:
 * - HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall (64-bit)
 * - HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall (32-bit)
 * - HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall (Per-user)
 *
 * In native Tauri mode, this executes the Rust Registry scanner.
 * In browser preview mode, it gracefully returns isolated preview fixtures.
 */
export async function scanInstalledSoftware(): Promise<SoftwareRecord[]> {
  if (tauriBridge.isTauri()) {
    try {
      const realRecords = await tauriBridge.scanInstalledSoftware();
      return realRecords;
    } catch (err) {
      console.warn('Native software scan failed:', err);
      return [];
    }
  }

  // Web preview mode fallback
  await new Promise(resolve => setTimeout(resolve, 300));
  return [...previewSoftwareCatalog];
}

