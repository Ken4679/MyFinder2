import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Terminal,
  FileCode,
  FileArchive,
  Star,
  Info,
  ExternalLink,
  Plus
} from 'lucide-react';
import { TreeNodeModel, FileCategory, FileRecord, FavoriteRecord } from '../types';
import { formatBytes } from '../services/storageService';
import { ContextMenu, ContextMenuAction } from './ContextMenu';

interface TreePageProps {
  treeNodes: TreeNodeModel[];
  favorites: FavoriteRecord[];
  onToggleFavoritePath: (path: string, isDirectory: boolean, name: string) => void;
  onOpenFile: (file: FileRecord) => void;
  onOpenInExplorer: (path: string) => void;
  onRefreshTree: () => void;
  onAddFolder: () => void;
}

export const TreePage: React.FC<TreePageProps> = ({
  treeNodes,
  favorites,
  onToggleFavoritePath,
  onOpenFile,
  onOpenInExplorer,
  onRefreshTree,
  onAddFolder,
}) => {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNodeModel;
  } | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedMap(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  const isExpanded = (node: TreeNodeModel) => {
    if (filterQuery.trim()) return true;
    if (expandedMap[node.id] !== undefined) {
      return expandedMap[node.id];
    }
    return !!node.isExpanded;
  };

  const isFavorite = (path: string) => {
    return favorites.some(f => f.targetPath.toLowerCase() === path.toLowerCase());
  };

  const getFileIcon = (category?: FileCategory) => {
    switch (category) {
      case FileCategory.Document:
        return <FileText className="w-4 h-4 text-blue-500" />;
      case FileCategory.Image:
        return <ImageIcon className="w-4 h-4 text-emerald-500" />;
      case FileCategory.Audio:
        return <Music className="w-4 h-4 text-purple-500" />;
      case FileCategory.Video:
        return <Video className="w-4 h-4 text-pink-500" />;
      case FileCategory.Executable:
        return <Terminal className="w-4 h-4 text-amber-500" />;
      case FileCategory.Config:
        return <FileCode className="w-4 h-4 text-teal-500" />;
      case FileCategory.Temp:
        return <FileArchive className="w-4 h-4 text-stone-500" />;
      default:
        return <FileText className="w-4 h-4 text-neutral-400" />;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: TreeNodeModel) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const getContextMenuActions = (node: TreeNodeModel): ContextMenuAction[] => [
    {
      label: node.isDirectory ? '浏览文件夹' : '查看文件详情',
      icon: node.isDirectory ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Info className="w-4 h-4 text-blue-500" />,
      onClick: () => {
        if (node.isDirectory) {
          onOpenInExplorer(node.fullPath);
        } else {
          onOpenFile({
            id: node.id,
            path: node.fullPath,
            fileName: node.name,
            extension: '.' + (node.name.split('.').pop() || ''),
            sizeBytes: node.sizeBytes || 0,
            category: node.category || FileCategory.Other,
            createdTime: node.updatedTime || new Date().toISOString(),
            updatedTime: node.updatedTime || new Date().toISOString(),
          });
        }
      },
    },
    {
      label: '在资源管理器中定位并选中',
      icon: <ExternalLink className="w-4 h-4 text-amber-500" />,
      onClick: () => onOpenInExplorer(node.fullPath),
    },
    {
      label: isFavorite(node.fullPath) ? '取消收藏' : '⭐ 添加到收藏',
      icon: <Star className={`w-4 h-4 ${isFavorite(node.fullPath) ? 'fill-amber-500 text-amber-500' : 'text-neutral-400'}`} />,
      onClick: () => onToggleFavoritePath(node.fullPath, node.isDirectory, node.name),
    },
  ];

  // Render recursive tree item
  const renderTreeNode = (node: TreeNodeModel, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const expanded = isExpanded(node);

    // Apply quick search query filter
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      const nodeMatches = node.name.toLowerCase().includes(q) || node.fullPath.toLowerCase().includes(q);
      const anyChildMatches = (n: TreeNodeModel): boolean => {
        if (n.name.toLowerCase().includes(q)) return true;
        if (n.children && n.children.some(anyChildMatches)) return true;
        return false;
      };
      if (!nodeMatches && !anyChildMatches(node)) {
        return null;
      }
    }

    return (
      <div key={node.id} className="select-none">
        <div
          id={`tree-node-${node.id}`}
          onClick={() => {
            if (node.isDirectory) {
              toggleExpand(node.id);
            } else {
              onOpenFile({
                id: node.id,
                path: node.fullPath,
                fileName: node.name,
                extension: '.' + (node.name.split('.').pop() || ''),
                sizeBytes: node.sizeBytes || 0,
                category: node.category || FileCategory.Other,
                createdTime: node.updatedTime || new Date().toISOString(),
                updatedTime: node.updatedTime || new Date().toISOString(),
              });
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, node)}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          className="group flex items-center justify-between py-1.5 pr-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-colors cursor-pointer text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            {node.isDirectory ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            ) : (
              <span className="w-4" />
            )}

            {node.isDirectory ? (
              expanded ? (
                <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              )
            ) : (
              <span className="shrink-0">{getFileIcon(node.category)}</span>
            )}

            <span className="font-medium text-[#1c1c1c] dark:text-[#f3f3f3] truncate group-hover:text-[#0078d4]">
              {node.name}
            </span>

            {node.isDirectory && node.children && (
              <span className="text-[10px] text-neutral-400 font-mono">
                ({node.children.length})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 opacity-80 group-hover:opacity-100">
            {node.sizeBytes !== undefined && !node.isDirectory && (
              <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
                {formatBytes(node.sizeBytes)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavoritePath(node.fullPath, node.isDirectory, node.name);
              }}
              className="p-1 text-neutral-300 hover:text-amber-500 transition-colors cursor-pointer"
              title={isFavorite(node.fullPath) ? '取消收藏' : '添加收藏'}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  isFavorite(node.fullPath)
                    ? 'fill-amber-500 text-amber-500'
                    : 'text-neutral-300 dark:text-neutral-600 hover:text-amber-500'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Render children when expanded */}
        {node.isDirectory && expanded && node.children && (
          <div className="space-y-0.5">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="tree-page" className="p-6 space-y-4 max-w-6xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
            <Folder className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              目录树
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              层级化浏览监控目录结构与已索引文件
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="tree-add-dir-btn"
            onClick={onAddFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加目录</span>
          </button>
          <button
            id="tree-refresh-btn"
            onClick={onRefreshTree}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="刷新目录树"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <Folder className="w-4 h-4 text-neutral-400 shrink-0" />
        <input
          type="text"
          id="tree-filter-input"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="快速筛选目录树中的节点与文件..."
          className="w-full bg-transparent text-xs text-[#1c1c1c] dark:text-[#f3f3f3] placeholder-neutral-400 focus:outline-none"
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery('')}
            className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 px-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tree Content Container */}
      <div className="flex-1 min-h-[400px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs overflow-y-auto">
        {treeNodes.length > 0 ? (
          <div className="space-y-1">
            {treeNodes.map(node => renderTreeNode(node, 0))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
            <Folder className="w-12 h-12 stroke-1 mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">暂无监控目录</p>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs">
              点击右上角「添加目录」或前往设置配置监控路径
            </p>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={getContextMenuActions(contextMenu.node)}
        />
      )}
    </div>
  );
};
