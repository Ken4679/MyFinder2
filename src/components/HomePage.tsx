import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Folder,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Terminal,
  FileCode,
  FileArchive,
  Star,
  ExternalLink,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  FolderOpen,
  Info,
  Copy
} from 'lucide-react';
import { FileRecord, FileCategory, AppSettings, FavoriteRecord } from '../types';
import { parseNaturalLanguageQuery } from '../services/naturalLanguageService';
import { formatBytes } from '../services/storageService';
import { getFileSafetyInfo } from '../services/fileSafetyService';
import { ContextMenu, ContextMenuAction } from './ContextMenu';
import { SecurityAssessmentModal } from './SecurityAssessmentModal';
import { Shield } from 'lucide-react';
import { tauriBridge } from '../services/tauriBridge';

interface HomePageProps {
  files: FileRecord[];
  settings: AppSettings;
  favorites: FavoriteRecord[];
  onToggleFavorite: (file: FileRecord) => void;
  onOpenFile: (file: FileRecord) => void;
  onOpenInExplorer: (file: FileRecord) => void;
  onRefresh: () => void;
  onNavigateToSettings: () => void;
  onNavigateToTree: (path?: string) => void;
  onNavigateToEncyclopedia?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  files,
  settings,
  favorites,
  onToggleFavorite,
  onOpenFile,
  onOpenInExplorer,
  onRefresh,
  onNavigateToSettings,
  onNavigateToTree,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDeepSearch, setIsDeepSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [nativeResults, setNativeResults] = useState<FileRecord[] | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileRecord;
  } | null>(null);
  const [securityInspectFile, setSecurityInspectFile] = useState<FileRecord | null>(null);

  // Debounce search query input (200ms)
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setIsSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // AI query parse
  const nlResult = useMemo(() => {
    if (!settings.isAiModeEnabled || !debouncedQuery.trim()) {
      return null;
    }
    return parseNaturalLanguageQuery(debouncedQuery);
  }, [debouncedQuery, settings.isAiModeEnabled]);

  // Async Native SQLite Search when in Tauri
  useEffect(() => {
    let isCancelled = false;
    if (!debouncedQuery.trim()) {
      setNativeResults(null);
      return;
    }

    if (tauriBridge.isTauri()) {
      setIsSearching(true);
      let targetCat: number | undefined = undefined;
      let startD: string | undefined = undefined;
      let endD: string | undefined = undefined;
      let q = debouncedQuery.trim();

      if (settings.isAiModeEnabled && nlResult && nlResult.isNaturalLanguage) {
        if (nlResult.extractedSearchText) {
          q = nlResult.extractedSearchText.trim();
        }
        if (nlResult.targetCategory !== undefined) {
          targetCat = nlResult.targetCategory as number;
        }
        if (nlResult.startDate) startD = nlResult.startDate;
        if (nlResult.endDate) endD = nlResult.endDate;
      }

      tauriBridge.searchFiles({
        query: q,
        category: targetCat,
        startDate: startD,
        endDate: endD,
        isDeepSearch,
        limit: 300,
      }).then(res => {
        if (!isCancelled) {
          setNativeResults(res);
          setIsSearching(false);
        }
      }).catch(err => {
        console.warn('Native SQLite search failed', err);
        if (!isCancelled) {
          setNativeResults(null);
          setIsSearching(false);
        }
      });

      return () => {
        isCancelled = true;
      };
    }
  }, [debouncedQuery, settings.isAiModeEnabled, nlResult, isDeepSearch]);

  // Filtered search results fallback for web preview
  const fallbackSearchResults = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return [];
    }

    let searchKeywords: string[] = [];
    let targetCategory: FileCategory | undefined = undefined;
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (settings.isAiModeEnabled && nlResult && nlResult.isNaturalLanguage) {
      if (nlResult.extractedSearchText) {
        searchKeywords = nlResult.extractedSearchText
          .split(/\s+/)
          .map(k => k.trim().toLowerCase())
          .filter(Boolean);
      }
      targetCategory = nlResult.targetCategory;
      if (nlResult.startDate) startDate = new Date(nlResult.startDate);
      if (nlResult.endDate) endDate = new Date(nlResult.endDate);
    } else {
      searchKeywords = debouncedQuery
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    }

    return files.filter(file => {
      if (targetCategory !== undefined && file.category !== targetCategory) {
        return false;
      }
      if (startDate || endDate) {
        const fDate = new Date(file.updatedTime);
        if (startDate && fDate < startDate) return false;
        if (endDate && fDate > endDate) return false;
      }
      if (searchKeywords.length === 0) return true;

      const name = file.fileName.toLowerCase();
      const path = file.path.toLowerCase();
      const ext = file.extension.toLowerCase();
      const snip = (file.contentSnippet || '').toLowerCase();

      if (isDeepSearch) {
        return searchKeywords.every(kw => name.includes(kw) || path.includes(kw) || ext.includes(kw) || snip.includes(kw));
      } else {
        return searchKeywords.every(kw => name.includes(kw) || path.includes(kw) || ext.includes(kw));
      }
    }).sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime());
  }, [files, debouncedQuery, settings.isAiModeEnabled, nlResult, isDeepSearch]);

  const searchResults = nativeResults !== null ? nativeResults : fallbackSearchResults;

  // Recent files (top 15 when no query)
  const recentFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime())
      .slice(0, 15);
  }, [files]);

  const isFavorite = (path: string) => {
    return favorites.some(f => f.targetPath.toLowerCase() === path.toLowerCase());
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const getFileIcon = (category: FileCategory, ext: string) => {
    switch (category) {
      case FileCategory.Document:
        return <FileText className="w-5 h-5 text-blue-500" />;
      case FileCategory.Image:
        return <ImageIcon className="w-5 h-5 text-emerald-500" />;
      case FileCategory.Audio:
        return <Music className="w-5 h-5 text-purple-500" />;
      case FileCategory.Video:
        return <Video className="w-5 h-5 text-pink-500" />;
      case FileCategory.Executable:
        return <Terminal className="w-5 h-5 text-amber-500" />;
      case FileCategory.Config:
        return <FileCode className="w-5 h-5 text-teal-500" />;
      case FileCategory.Temp:
        return <FileArchive className="w-5 h-5 text-stone-500" />;
      default:
        return <FileText className="w-5 h-5 text-neutral-400" />;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileRecord) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const getContextMenuActions = (file: FileRecord): ContextMenuAction[] => [
    {
      label: '在资源管理器中定位并选中',
      icon: <FolderOpen className="w-4 h-4 text-amber-500" />,
      onClick: () => onOpenInExplorer(file),
    },
    {
      label: '查看文件详情与安全评估',
      icon: <Info className="w-4 h-4 text-blue-500" />,
      onClick: () => onOpenFile(file),
    },
    {
      label: '深度信任与签名审计 (Phase 5)',
      icon: <Shield className="w-4 h-4 text-indigo-500" />,
      onClick: () => setSecurityInspectFile(file),
    },
    {
      label: '复制文件完整路径',
      icon: <Copy className="w-4 h-4 text-neutral-500" />,
      onClick: () => {
        navigator.clipboard?.writeText(file.path);
        showToast('已复制完整路径到剪贴板 📋');
      },
    },
    {
      label: '复制文件名',
      icon: <FileText className="w-4 h-4 text-neutral-500" />,
      onClick: () => {
        navigator.clipboard?.writeText(file.fileName);
        showToast('已复制文件名 📋');
      },
    },
    {
      label: isFavorite(file.path) ? '取消收藏' : '⭐ 添加到收藏',
      icon: <Star className={`w-4 h-4 ${isFavorite(file.path) ? 'fill-amber-500 text-amber-500' : 'text-neutral-400'}`} />,
      onClick: () => {
        onToggleFavorite(file);
        showToast(isFavorite(file.path) ? '已从收藏夹移除' : '已添加到收藏夹 ⭐');
      },
    },
  ];

  return (
    <div id="home-page" className="p-6 space-y-4 max-w-6xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header Action Bar */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              主页搜索
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              基于 SQLite FTS5 本地倒排索引与自然语言语义解析
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium border border-emerald-200 dark:border-emerald-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>状态实时核验中 (0 滞后)</span>
          </div>

          <button
            id="home-refresh-btn"
            onClick={onRefresh}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/5 transition-colors cursor-pointer text-xs font-medium"
            title="实时重新校验所有文件磁盘状态"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">即时同步核验</span>
          </button>
        </div>
      </div>

      {/* Search Bar (AutoSuggestBox) */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            id="home-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件名、扩展名或自然语言（如：上周的图片、财务.xlsx、昨天的文档）"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#2b2b2b] text-[#1c1c1c] dark:text-[#f3f3f3] text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0078d4]/30 focus:border-[#0078d4] transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              id="clear-search-btn"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* AI Parsed Description Badge */}
      {settings.isAiModeEnabled && nlResult && nlResult.isNaturalLanguage && (
        <div
          id="ai-parsed-badge"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 dark:bg-blue-600 text-white text-xs font-medium shadow-xs animate-in fade-in slide-in-from-top-1 duration-150 w-fit"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>{nlResult.parsedDescription}</span>
        </div>
      )}

      {/* Watched Directories Card */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-[#0078d4]" />
            <span className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              当前可搜索的监控文件夹 ({settings.watchedDirectories.length})
            </span>
          </div>
          <button
            id="nav-to-settings-btn"
            onClick={onNavigateToSettings}
            className="text-xs text-[#0078d4] hover:underline cursor-pointer flex items-center gap-1 font-medium"
          >
            <span>管理目录</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {settings.watchedDirectories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {settings.watchedDirectories.map((dir, idx) => (
              <div
                key={idx}
                onClick={() => onNavigateToTree(dir)}
                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-[#202020] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 border border-black/5 dark:border-white/5 transition-colors cursor-pointer"
                title="点击在目录树中查看"
              >
                <Folder className="w-3 h-3 text-neutral-400 group-hover:text-blue-500" />
                <span className="font-mono">{dir}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400 py-1">暂无索引目录，请前往「设置」添加</p>
        )}
      </div>

      {/* Main Content Area: Search Results or Recent Files */}
      <div className="flex-1 min-h-[320px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs flex flex-col">
        {/* Section Title */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            {searchQuery ? (
              <span>搜索结果 ({searchResults.length})</span>
            ) : (
              <span>最近索引与访问的文件 ({recentFiles.length})</span>
            )}
          </div>

          {searchQuery && searchResults.length > 0 && (
            <button
              id="toggle-deep-search-btn"
              onClick={() => setIsDeepSearch(!isDeepSearch)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                isDeepSearch
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              title="切换是否深度检索文件内容与模糊匹配"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isDeepSearch ? '深度内容匹配已开启' : '开启深度模糊搜索'}</span>
            </button>
          )}
        </div>

        {/* Search Results / Recent List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {searchQuery ? (
            searchResults.length > 0 ? (
              searchResults.map((file) => {
                const sInfo = getFileSafetyInfo(file.extension, file.path);
                return (
                  <div
                    key={file.id}
                    id={`search-item-${file.id}`}
                    onClick={() => onOpenFile(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    className="group flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100/80 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 p-1.5 rounded bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5">
                        {getFileIcon(file.category, file.extension)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] truncate group-hover:text-[#0078d4]">
                            {file.fileName}
                          </p>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              sInfo.level === 'danger'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                : sInfo.level === 'caution'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                            title={`${sInfo.levelBadge}: ${sInfo.deletionSafety}`}
                          >
                            {sInfo.level === 'danger' ? '🔴 严禁删' : sInfo.level === 'caution' ? '🟡 谨慎' : '🟢 安全'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono truncate max-w-lg">
                          {file.path}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3 text-right">
                      <div className="hidden sm:block">
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                      <div className="hidden md:block">
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          {new Date(file.updatedTime).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(file);
                          showToast(isFavorite(file.path) ? '已从收藏夹移除' : '已添加到收藏夹 ⭐');
                        }}
                        className="p-1 rounded text-neutral-300 hover:text-amber-500 transition-colors cursor-pointer"
                        title={isFavorite(file.path) ? '已收藏' : '添加收藏'}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFavorite(file.path)
                              ? 'fill-amber-500 text-amber-500'
                              : 'text-neutral-300 dark:text-neutral-600 hover:text-amber-500'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                <Search className="w-10 h-10 stroke-1 mb-2 text-neutral-300 dark:text-neutral-600" />
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">未找到匹配的文件</p>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs">
                  尝试检查拼写，或点击上方「开启深度模糊搜索」扩大匹配范围
                </p>
              </div>
            )
          ) : (
            recentFiles.length > 0 ? (
              recentFiles.map((file) => {
                const sInfo = getFileSafetyInfo(file.extension, file.path);
                return (
                  <div
                    key={file.id}
                    id={`recent-item-${file.id}`}
                    onClick={() => onOpenFile(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    className="group flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100/80 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 p-1.5 rounded bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5">
                        {getFileIcon(file.category, file.extension)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] truncate group-hover:text-[#0078d4]">
                            {file.fileName}
                          </p>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              sInfo.level === 'danger'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                : sInfo.level === 'caution'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                            title={`${sInfo.levelBadge}: ${sInfo.deletionSafety}`}
                          >
                            {sInfo.level === 'danger' ? '🔴 严禁删' : sInfo.level === 'caution' ? '🟡 谨慎' : '🟢 安全'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono truncate max-w-lg">
                          {file.path}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3 text-right">
                      <div className="hidden sm:block">
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                      <div className="hidden md:block">
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          {new Date(file.updatedTime).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(file);
                          showToast(isFavorite(file.path) ? '已从收藏夹移除' : '已添加到收藏夹 ⭐');
                        }}
                        className="p-1 rounded text-neutral-300 hover:text-amber-500 transition-colors cursor-pointer"
                        title={isFavorite(file.path) ? '已收藏' : '添加收藏'}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFavorite(file.path)
                              ? 'fill-amber-500 text-amber-500'
                              : 'text-neutral-300 dark:text-neutral-600 hover:text-amber-500'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                <Folder className="w-10 h-10 stroke-1 mb-2 text-neutral-300 dark:text-neutral-600" />
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">还没有文件记录</p>
                <p className="text-xs text-neutral-400 mt-1">
                  去「设置」或「目录树」添加索引目录以开始快速搜索
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Toast popup */}
      {toastMessage && (
        <div
          id="home-toast"
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {toastMessage}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={getContextMenuActions(contextMenu.file)}
        />
      )}

      {/* Security Assessment Modal */}
      {securityInspectFile && (
        <SecurityAssessmentModal
          targetPath={securityInspectFile.path}
          targetName={securityInspectFile.fileName}
          onClose={() => setSecurityInspectFile(null)}
        />
      )}
    </div>
  );
};
