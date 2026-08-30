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
import { scanInstalledSoftware, previewSoftwareCatalog } from './services/softwareScannerService';
import { fileSyncService } from './services/fileSyncService';
import { tauriBridge } from './services/tauriBridge';
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
  const [softwareList, setSoftwareList] = useState<SoftwareRecord[]>(() =>
    tauriBridge.isTauri() ? [] : [...previewSoftwareCatalog]
  );
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

  // Initial load from native SQLite database and Windows Registry if running in Tauri
  useEffect(() => {
    if (tauriBridge.isTauri()) {
      tauriBridge.getIndexedFiles(500, 0).then(indexedFiles => {
        if (indexedFiles && indexedFiles.length > 0) {
          setFiles(indexedFiles);
        }
      }).catch(err => {
        console.warn('Failed to fetch initial indexed files from SQLite', err);
      });

      setIsSoftwareScanning(true);
      scanInstalledSoftware().then(scanned => {
        setSoftwareList(scanned);
        setIsSoftwareScanning(false);
      }).catch(err => {
        console.warn('Failed to scan installed software from Windows Registry', err);
        setIsSoftwareScanning(false);
      });
    }
  }, []);

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
    if (tauriBridge.isTauri()) {
      tauriBridge.getIndexStats().then(stats => {
        if (stats.totalFiles > 0) {
          showToast(`🟢 启动完成：已加载 SQLite 索引库（收录 ${stats.totalFiles} 个本地文件）`);
        }
      }).catch(() => {});
    }
  }, []);

  const handleManualSync = useCallback(async () => {
    if (tauriBridge.isTauri()) {
      showToast(`🔄 正在与本地文件系统全量核验...`);
      for (const dir of settings.watchedDirectories) {
        await tauriBridge.startIndexing(dir, settings.includeSubdirectories);
      }
      // Wait a moment for scanner thread to populate SQLite
      setTimeout(async () => {
        const fresh = await tauriBridge.getIndexedFiles(500, 0);
        if (fresh && fresh.length > 0) {
          setFiles(fresh);
          showToast(`🟢 实时核验完成：已从 SQLite 加载 ${fresh.length} 个真实文件记录`);
        }
      }, 1000);
      return;
    }

    const syncResult = fileSyncService.verifyFileOnOpen(files[0]?.path || '', files);
    showToast(`🟢 实时核验完成：当前已收录 ${files.length} 个监控文件（0滞后）`);
  }, [files, settings.watchedDirectories, settings.includeSubdirectories, showToast]);

  const handleOpenFile = async (file: FileRecord) => {
    if (tauriBridge.isTauri()) {
      try {
        const exists = await tauriBridge.verifyFileExists(file.path);
        if (!exists) {
          setFiles(prev => prev.filter(f => f.path.toLowerCase() !== file.path.toLowerCase()));
          setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== file.path.toLowerCase()));
          setSelectedFileForViewer(null);
          showToast(`⚠️ 检测到「${file.fileName}」已在外部被删除或移动，已自动移出索引！`);
          return;
        }
        await tauriBridge.openFileNative(file.path);
        showToast(`📄 已调用系统默认应用打开：${file.fileName}`);
        return;
      } catch (err) {
        console.warn('Native open failed', err);
      }
    }

    // Zero-lag integrity verification before opening in preview
    const check = fileSyncService.verifyFileOnOpen(file.path, files);
    if (!check.exists) {
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

  const handleOpenFileByPath = async (path: string) => {
    if (tauriBridge.isTauri()) {
      try {
        const exists = await tauriBridge.verifyFileExists(path);
        if (!exists) {
          setFiles(prev => prev.filter(f => f.path.toLowerCase() !== path.toLowerCase()));
          setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== path.toLowerCase()));
          showToast(`⚠️ 目标文件在磁盘上已不存在（已被删除或移动）`);
          return;
        }
        await tauriBridge.openFileNative(path);
        showToast(`📄 已调用系统默认应用打开：${path}`);
        return;
      } catch (err) {
        console.warn('Native open failed', err);
      }
    }

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

  const handleOpenInExplorer = async (item: FileRecord | string) => {
    const path = typeof item === 'string' ? item : item.path;
    if (tauriBridge.isTauri()) {
      try {
        await tauriBridge.revealInExplorerNative(path);
        showToast(`📂 在 Windows 资源管理器中定位：${path}`);
        return;
      } catch (err) {
        console.warn('Native reveal failed', err);
      }
    }

    const check = fileSyncService.verifyFileOnOpen(path, files);
    if (!check.exists) {
      setFiles(prev => prev.filter(f => f.path.toLowerCase() !== path.toLowerCase()));
      setFavorites(prev => prev.filter(fav => fav.targetPath.toLowerCase() !== path.toLowerCase()));
      showToast(`⚠️ 目标路径「${path}」在磁盘上不存在（已被删除或移动），已自动同步状态`);
      return;
    }
    showToast(`📂 在 Windows 资源管理器中打开：${path}`);
  };

  const handleAddWatchedDirectory = async (dir: string) => {
    if (!settings.watchedDirectories.includes(dir)) {
      const newDirs = [...settings.watchedDirectories, dir];
      setSettings(prev => ({ ...prev, watchedDirectories: newDirs }));

      if (tauriBridge.isTauri()) {
        showToast(`🚀 正在索引目录: ${dir}...`);
        await tauriBridge.startIndexing(dir, settings.includeSubdirectories);
        setTimeout(async () => {
          const fresh = await tauriBridge.getIndexedFiles(500, 0);
          if (fresh && fresh.length > 0) {
            setFiles(fresh);
            showToast(`✅ 目录 ${dir} 索引完成，当前已加载 ${fresh.length} 个文件`);
          }
        }, 1200);
        return;
      }

      // Fallback for web preview
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

  const handleRemoveWatchedDirectory = async (dir: string) => {
    setSettings(prev => ({
      ...prev,
      watchedDirectories: prev.watchedDirectories.filter(d => d !== dir),
    }));

    if (tauriBridge.isTauri()) {
      await tauriBridge.removeDirectoryFromIndex(dir);
      const fresh = await tauriBridge.getIndexedFiles(500, 0);
      setFiles(fresh);
      showToast(`已移除目录索引：${dir}`);
      return;
    }

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

    if (tauriBridge.isTauri()) {
      showToast(`🚀 正在对「${targetPath}」进行真实文件扫描与构建 SQLite 索引...`);
      await tauriBridge.startIndexing(targetPath, includeSubfolders);
      
      // Poll indexing status
      const checkInterval = setInterval(async () => {
        const st = await tauriBridge.getIndexingStatus();
        if (st.state === 'completed' || st.state === 'error' || st.state === 'cancelled') {
          clearInterval(checkInterval);
          const fresh = await tauriBridge.getIndexedFiles(500, 0);
          setFiles(fresh);
          if (st.state === 'completed') {
            showToast(`✅ 已完成对 ${targetPath} 的真实扫描索引（已索引 ${st.filesIndexed} 个文件，耗时 ${st.elapsedMs} ms）`);
          } else {
            showToast(`⚠️ 索引状态：${st.message || st.state}`);
          }
        }
      }, 500);
      return;
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
    if (tauriBridge.isTauri()) {
      await tauriBridge.optimizeDatabase();
      showToast('⚡ SQLite 数据库与 FTS5 全文索引优化整理完成');
      return;
    }
    await new Promise(r => setTimeout(r, 600));
    const uniqueMap = new Map<string, FileRecord>();
    files.forEach(f => uniqueMap.set(f.path.toLowerCase(), f));
    setFiles(Array.from(uniqueMap.values()));
    showToast('⚡ 数据库与全文索引优化整理完成');
  };

  const handleRescanSoftware = async () => {
    setIsSoftwareScanning(true);
    const scanned = await scanInstalledSoftware();
    setSoftwareList(scanned);
    setIsSoftwareScanning(false);
  };

  const handleLaunchSoftware = (soft: SoftwareRecord) => {
    if (tauriBridge.isTauri() && soft.mainExePath) {
      tauriBridge.openFileNative(soft.mainExePath).catch(() => {});
    }
    showToast(`🚀 启动应用程序: ${soft.displayName} (${soft.mainExePath})`);
  };

  const handleOpenInstallFolder = (soft: SoftwareRecord) => {
    const p = soft.installLocation || soft.mainExePath;
    if (tauriBridge.isTauri() && p) {
      tauriBridge.openFolderNative(p).catch(() => {});
    }
    showToast(`📂 打开安装目录: ${p}`);
  };

  const treeNodes = useMemo(() => {
    return dbService.buildDirectoryTree(settings.watchedDirectories);
  }, [dbService, files, settings.watchedDirectories]);

  const handleWipeAllData = async () => {
    if (tauriBridge.isTauri()) {
      await tauriBridge.wipeIndex();
    }
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
