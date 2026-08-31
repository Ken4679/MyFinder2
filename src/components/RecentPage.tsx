import React, { useState } from 'react';
import {
  Clock,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Terminal,
  FileCode,
  FileArchive,
  Star,
  FolderOpen,
  Info,
  Copy
} from 'lucide-react';
import { FileRecord, FileCategory, FavoriteRecord } from '../types';
import { formatBytes } from '../services/storageService';
import { ContextMenu, ContextMenuAction } from './ContextMenu';

interface RecentPageProps {
  files: FileRecord[];
  favorites: FavoriteRecord[];
  onToggleFavorite: (file: FileRecord) => void;
  onOpenFile: (file: FileRecord) => void;
  onOpenInExplorer: (file: FileRecord) => void;
  onRefresh: () => void;
}

export const RecentPage: React.FC<RecentPageProps> = ({
  files,
  favorites,
  onToggleFavorite,
  onOpenFile,
  onOpenInExplorer,
  onRefresh,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileRecord;
  } | null>(null);

  const isFavorite = (path: string) => {
    return favorites.some(f => f.targetPath.toLowerCase() === path.toLowerCase());
  };

  const getFileIcon = (category: FileCategory) => {
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

  const sortedFiles = [...files].sort(
    (a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime()
  );

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
      label: '复制文件完整路径',
      icon: <Copy className="w-4 h-4 text-neutral-500" />,
      onClick: () => {
        navigator.clipboard?.writeText(file.path);
      },
    },
    {
      label: '复制文件名',
      icon: <FileText className="w-4 h-4 text-neutral-500" />,
      onClick: () => {
        navigator.clipboard?.writeText(file.fileName);
      },
    },
    {
      label: isFavorite(file.path) ? '取消收藏' : '⭐ 添加到收藏',
      icon: <Star className={`w-4 h-4 ${isFavorite(file.path) ? 'fill-amber-500 text-amber-500' : 'text-neutral-400'}`} />,
      onClick: () => onToggleFavorite(file),
    },
  ];

  return (
    <div id="recent-page" className="p-6 space-y-4 max-w-6xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              最近修改的文件
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              基于本地真实修改时间戳 (Last Modified Time) 排序的索引文件列表
            </p>
          </div>
        </div>

        <button
          id="recent-refresh-btn"
          onClick={onRefresh}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title="刷新最近文件"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* List Container */}
      <div className="flex-1 min-h-[400px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs overflow-y-auto">
        <div className="space-y-1">
          {sortedFiles.length > 0 ? (
            sortedFiles.map((file) => (
              <div
                key={file.id}
                id={`recent-row-${file.id}`}
                onClick={() => onOpenFile(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                className="group flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100/80 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 p-1.5 rounded bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5">
                    {getFileIcon(file.category)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] truncate group-hover:text-[#0078d4]">
                      {file.fileName}
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono truncate max-w-xl">
                      {file.path}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-3 text-right">
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500 hidden sm:inline">
                    {formatBytes(file.sizeBytes)}
                  </span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    {new Date(file.updatedTime).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(file);
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
            ))
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <Clock className="w-12 h-12 stroke-1 mb-2 text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">暂无最近文件记录</p>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={getContextMenuActions(contextMenu.file)}
        />
      )}
    </div>
  );
};
