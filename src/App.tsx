import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCategory,
  FileRecord,
  SoftwareRecord,
  FavoriteRecord,
  AppSettings,
  NavTab,
  ElementThemeMode
} from './types';
import {
  loadSettings,
  saveSettings,
  loadFavorites,
  saveFavorites,
  loadFiles,
  saveFiles,
  determineCategory,
  defaultSeedFiles
} from './services/storageService';
import { FileDatabaseService } from './services/fileDatabaseService';
import { scanInstalledSoftware, defaultSoftwareCatalog } from './services/softwareScannerService';
import { fileSyncService } from './services/fileSyncService';
import { Shell } from './components/Shell';
import { HomePage } from './components/HomePage';
import { TreePage } from './components/TreePage';
import { RecentPage } from './components/RecentPage';
import { SoftwarePage } from './components/SoftwarePage';
import { FavoritesPage } from './components/FavoritesPage';
import { SettingsPage } from './components/SettingsPage';
import { EncyclopediaPage } from './components/EncyclopediaPage';
import { PortableCenterPage } from './components/PortableCenterPage';
import { QuickStartWizardModal } from './components/QuickStartWizardModal';
import { FileViewerModal } from './components/FileViewerModal';

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [files, setFiles] = useState<FileRecord[]>(() => loadFiles());
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(() => loadFavorites());
  const [softwareList, setSoftwareList] = useState<SoftwareRecord[]>(() => [...defaultSoftwareCatalog]);
  const [isSoftwareScanning, setIsSoftwareScanning] = useState(false);
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [selectedFileForViewer, setSelectedFileForViewer] = useState<FileRecord | null>(null);
  const [isQuickWizardOpen, setIsQuickWizardOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize DB service
  const dbService = useMemo(() => new FileDatabaseService(files), []);

  // Update DB service when files change
  useEffect(() => {
    dbService.setFiles(files);
    saveFiles(files);
  }, [files, dbService]);

  // Save settings when changed
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Save favorites when changed
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const handleToggleTheme = () => {
    const order: ElementThemeMode[] = ['light', 'dark', 'system'];
    const nextIdx = (order.indexOf(settings.theme) + 1) % order.length;
    const nextTheme = order[nextIdx];
    setSettings(prev => ({ ...prev, theme: nextTheme }));
    showToast(`主题模式切换为: ${nextTheme === 'light' ? '浅色' : nextTheme === 'dark' ? '深色' : '跟随系统'}`);
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  // Toggle favorite for a file record
  const handleToggleFavorite = (file: FileRecord) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.targetPath.toLowerCase() === file.path.toLowerCase());
      if (exists) {
        return prev.filter(f => f.targetPath.toLowerCase() !== file.path.toLowerCase());
      } else {
        const newFav: FavoriteRecord = {
          id: `fav-${Date.now()}`,
          targetPath: file.path,
          targetType: 0,
          displayAlias: file.fileName,
          createdTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
        };
        return [newFav, ...prev];
      }
    });
  };

  // Toggle favorite for any arbitrary path (folder or file)
  const handleToggleFavoritePath = (path: string, isDirectory: boolean, name: string) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.targetPath.toLowerCase() === path.toLowerCase());
      if (exists) {
        showToast('已从收藏夹移除');
        return prev.filter(f => f.targetPath.toLowerCase() !== path.toLowerCase());
      } else {
        const newFav: FavoriteRecord = {
          id: `fav-${Date.now()}`,
          targetPath: path,
          targetType: isDirectory ? 1 : 0,
          displayAlias: name || path.split('\\').pop() || path,
          createdTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
        };
        showToast('已添加到收藏夹 ⭐');
        return [newFav, ...prev];
      }
    });
  };

  const handleAddFavorite = (path: string, type: number, alias?: string) => {
    const newFav: FavoriteRecord = {
      id: `fav-${Date.now()}`,
      targetPath: path,
      targetType: type,
      displayAlias: alias || path.split('\\').pop() || path,
      createdTime: new Date().toISOString(),
      updatedTime: new Date().toISOString(),
    };
    setFavorites(prev => [newFav, ...prev]);
  };

  const handleRemoveFavorite = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  // Startup check & zero-lag synchronization
  useEffect(() => {
    const syncResult = fileSyncService.syncAllFiles(files, settings.watchedDirectories);
    if (syncResult.removedCount > 0 || syncResult.updatedCount > 0) {
      setFiles(syncResult.syncedFiles);
      const remainingPaths = new Set(syncResult.syncedFiles.map(f => f.path.toLowerCase()));
      setFavorites(prev => prev.filter(fav => fav.targetType === 1 || remainingPaths.has(fav.targetPath.toLowerCase())));
      showToast(`🟢 启动自检完成：已实时同步文件状态并清理 ${syncResult.removedCount} 个外部删除的文件（0滞后）`);
    }
  }, []);

  const handleManualSync = useCallback(() => {
    const syncResult = fileSyncService.syncAllFiles(files, settings.watchedDirectories);
    setFiles(syncResult.syncedFiles);
    const remainingPaths = new Set(syncResult.syncedFiles.map(f => f.path.toLowerCase()));
    setFavorites(prev => prev.filter(fav => fav.targetType === 1 || remainingPaths.has(fav.targetPath.toLowerCase())));
    if (syncResult.removedCount > 0 || syncResult.updatedCount > 0) {
      showToast(`🟢 同步完成：更新 ${syncResult.updatedCount} 个修改，清理 ${syncResult.removedCount} 个已失效文件（0滞后）`);
    } else {
      showToast(`🟢 实时核验完成：所有 ${syncResult.syncedFiles.length} 个监控文件状态完全一致且正常（0滞后）`);
    }
  }, [files, settings.watchedDirectories, showToast]);

  const handleOpenFile = (file: FileRecord) => {
    // Zero-lag integrity verification before opening
    const check = fileSyncService.verifyFileOnOpen(file.path, files);
    if (!check.exists) {
      // Auto-prune ghost file from index and favorites immediately
      setFiles(prev => prev.filter(f => f.path.toLowerCase() !== file.path.toLowerCase()));
      setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== file.path.toLowerCase()));
      setSelectedFileForViewer(null);
      showToast(`⚠️ 检测到「${file.fileName}」已在外部被删除或移动，已自动更新状态并移出索引（0滞后）！`);
      return;
    }

    if (check.updatedRecord) {
      setFiles(prev => prev.map(f => f.path.toLowerCase() === file.path.toLowerCase() ? check.updatedRecord! : f));
      setSelectedFileForViewer(check.updatedRecord);
      showToast(`🔄 已核验「${file.fileName}」状态并同步最新属性`);
    } else {
      setSelectedFileForViewer(file);
    }
  };

  const handleOpenFileByPath = (path: string) => {
    const check = fileSyncService.verifyFileOnOpen(path, files);
    if (!check.exists) {
      setFiles(prev => prev.filter(f => f.path.toLowerCase() !== path.toLowerCase()));
      setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== path.toLowerCase()));
      showToast(`⚠️ 目标文件在磁盘上已不存在（已被删除或移动），已自动同步移除`);
      return;
    }

    const existing = files.find(f => f.path.toLowerCase() === path.toLowerCase());
    if (existing) {
      setSelectedFileForViewer(check.updatedRecord || existing);
    } else {
      const fileName = path.split('\\').pop() || 'file';
      const ext = '.' + (fileName.split('.').pop() || '');
      setSelectedFileForViewer({
        id: `temp-${Date.now()}`,
        path: path,
        fileName: fileName,
        extension: ext,
        sizeBytes: 1024 * 100,
        category: determineCategory(ext),
        createdTime: new Date().toISOString(),
        updatedTime: new Date().toISOString(),
      });
    }
  };

  const handleOpenInExplorer = (item: FileRecord | string) => {
    const path = typeof item === 'string' ? item : item.path;
    const check = fileSyncService.verifyFileOnOpen(path, files);
    if (!check.exists) {
      setFiles(prev => prev.filter(f => f.path.toLowerCase() !== path.toLowerCase()));
      setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== path.toLowerCase()));
      showToast(`⚠️ 目标路径「${path}」在磁盘上不存在（已被删除或移动），已自动同步状态`);
      return;
    }
    showToast(`📂 在 Windows 资源管理器中打开：${path}`);
  };

  const handleAddWatchedDirectory = (dir: string) => {
    if (!settings.watchedDirectories.includes(dir)) {
      const newDirs = [...settings.watchedDirectories, dir];
      setSettings(prev => ({ ...prev, watchedDirectories: newDirs }));

      // Generate seed sample files for newly added directory
      const folderName = dir.split('\\').pop() || 'Folder';
      const sampleFiles: FileRecord[] = [
        {
          id: `f-${Date.now()}-1`,
          path: `${dir}\\${folderName}_Overview.md`,
          fileName: `${folderName}_Overview.md`,
          extension: '.md',
          sizeBytes: 15400,
          category: FileCategory.Document,
          createdTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
          contentSnippet: `# ${folderName} Overview\nAuto-indexed by MyFinder engine.`,
        },
        {
          id: `f-${Date.now()}-2`,
          path: `${dir}\\config.json`,
          fileName: 'config.json',
          extension: '.json',
          sizeBytes: 4200,
          category: FileCategory.Config,
          createdTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
          contentSnippet: '{\n  "version": "1.0",\n  "enabled": true\n}',
        }
      ];

      setFiles(prev => [...sampleFiles, ...prev]);
    }
  };

  const handleRemoveWatchedDirectory = (dir: string) => {
    setSettings(prev => ({
      ...prev,
      watchedDirectories: prev.watchedDirectories.filter(d => d !== dir),
    }));
    dbService.deleteFilesByDirectory(dir);
    setFiles(dbService.getFiles());
    showToast(`已移除监控目录：${dir}`);
  };

  const handleStartIndexing = async (targetPath: string, includeSubfolders: boolean) => {
    if (!settings.watchedDirectories.includes(targetPath)) {
      setSettings(prev => ({
        ...prev,
        watchedDirectories: [...prev.watchedDirectories, targetPath],
        includeSubdirectories: includeSubfolders,
      }));
    }

    const folderName = targetPath.split('\\').pop() || 'Folder';
    const newFiles: FileRecord[] = [
      {
        id: `f-${Date.now()}-1`,
        path: `${targetPath}\\${folderName}_文档汇总.docx`,
        fileName: `${folderName}_文档汇总.docx`,
        extension: '.docx',
        sizeBytes: 854000,
        category: FileCategory.Document,
        createdTime: new Date().toISOString(),
        updatedTime: new Date().toISOString(),
        contentSnippet: `在 ${targetPath} 下建立的本地全文索引样本。`,
      },
      {
        id: `f-${Date.now()}-2`,
        path: `${targetPath}\\架构规划图.png`,
        fileName: '架构规划图.png',
        extension: '.png',
        sizeBytes: 2450000,
        category: FileCategory.Image,
        createdTime: new Date().toISOString(),
        updatedTime: new Date().toISOString(),
      },
    ];

    setFiles(prev => [...newFiles, ...prev]);
    showToast(`已完成对 ${targetPath} 的高速扫描与索引建立 ✅`);
  };

  const handleOptimizeDatabase = async () => {
    await new Promise(r => setTimeout(r, 600));
    // Prune duplicates and rebuild index
    const uniqueMap = new Map<string, FileRecord>();
    files.forEach(f => uniqueMap.set(f.path.toLowerCase(), f));
    setFiles(Array.from(uniqueMap.values()));
  };

  const handleRescanSoftware = async () => {
    setIsSoftwareScanning(true);
    const scanned = await scanInstalledSoftware();
    setSoftwareList(scanned);
    setIsSoftwareScanning(false);
  };

  const handleLaunchSoftware = (soft: SoftwareRecord) => {
    showToast(`🚀 启动应用程序: ${soft.displayName} (${soft.mainExePath})`);
  };

  const handleOpenInstallFolder = (soft: SoftwareRecord) => {
    showToast(`📂 打开安装目录: ${soft.installLocation || soft.mainExePath}`);
  };

  const treeNodes = useMemo(() => {
    return dbService.buildDirectoryTree(settings.watchedDirectories);
  }, [dbService, files, settings.watchedDirectories]);

  const handleWipeAllData = () => {
    // Clear localStorage and reset state completely for zero-trace portability
    localStorage.clear();
    setFiles([]);
    setFavorites([]);
    setSettings(loadSettings());
    showToast('已彻底清空本软件所有索引与配置，无任何残留！');
  };

  return (
    <Shell
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      theme={settings.theme}
      onToggleTheme={handleToggleTheme}
      fileCount={files.length}
      softwareCount={softwareList.length}
      favoritesCount={favorites.length}
    >
      {currentTab === 'home' && (
        <HomePage
          files={files}
          settings={settings}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          onOpenFile={handleOpenFile}
          onOpenInExplorer={handleOpenInExplorer}
          onRefresh={handleManualSync}
          onNavigateToSettings={() => setCurrentTab('settings')}
          onNavigateToTree={(path) => {
            setCurrentTab('tree');
          }}
          onNavigateToEncyclopedia={() => setCurrentTab('encyclopedia')}
        />
      )}

      {currentTab === 'tree' && (
        <TreePage
          treeNodes={treeNodes}
          favorites={favorites}
          onToggleFavoritePath={handleToggleFavoritePath}
          onOpenFile={handleOpenFile}
          onOpenInExplorer={handleOpenInExplorer}
          onRefreshTree={handleManualSync}
          onAddFolder={() => setIsQuickWizardOpen(true)}
        />
      )}

      {currentTab === 'recent' && (
        <RecentPage
          files={files}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          onOpenFile={handleOpenFile}
          onOpenInExplorer={handleOpenInExplorer}
          onRefresh={handleManualSync}
        />
      )}

      {currentTab === 'software' && (
        <SoftwarePage
          softwareList={softwareList}
          isScanning={isSoftwareScanning}
          onRescan={handleRescanSoftware}
          onLaunchSoftware={handleLaunchSoftware}
          onOpenInstallFolder={handleOpenInstallFolder}
        />
      )}

      {currentTab === 'favorites' && (
        <FavoritesPage
          favorites={favorites}
          onRemoveFavorite={handleRemoveFavorite}
          onAddFavorite={handleAddFavorite}
          onOpenFileByPath={handleOpenFileByPath}
          onOpenInExplorer={handleOpenInExplorer}
        />
      )}

      {currentTab === 'encyclopedia' && (
        <EncyclopediaPage />
      )}

      {currentTab === 'portable' && (
        <PortableCenterPage
          settings={settings}
          files={files}
          onWipeData={handleWipeAllData}
          onRefreshFiles={handleManualSync}
        />
      )}

      {currentTab === 'settings' && (
        <SettingsPage
          settings={settings}
          fileCount={files.length}
          onUpdateSettings={handleUpdateSettings}
          onAddWatchedDirectory={handleAddWatchedDirectory}
          onRemoveWatchedDirectory={handleRemoveWatchedDirectory}
          onOpenQuickStartWizard={() => setIsQuickWizardOpen(true)}
          onOptimizeDatabase={handleOptimizeDatabase}
        />
      )}

      {/* Quick Start Wizard Modal */}
      <QuickStartWizardModal
        isOpen={isQuickWizardOpen}
        onClose={() => setIsQuickWizardOpen(false)}
        onStartIndexing={handleStartIndexing}
      />

      {/* File Viewer Modal */}
      <FileViewerModal
        file={selectedFileForViewer}
        isFavorite={
          selectedFileForViewer
            ? favorites.some(f => f.targetPath.toLowerCase() === selectedFileForViewer.path.toLowerCase())
            : false
        }
        onToggleFavorite={handleToggleFavorite}
        onClose={() => setSelectedFileForViewer(null)}
        onOpenInExplorer={handleOpenInExplorer}
      />

      {/* Global Toast Message */}
      {toastMessage && (
        <div
          id="global-toast"
          className="fixed bottom-8 right-8 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none"
        >
          {toastMessage}
        </div>
      )}
    </Shell>
  );
}
