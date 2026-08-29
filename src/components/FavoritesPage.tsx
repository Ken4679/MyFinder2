import React, { useState } from 'react';
import {
  Star,
  Plus,
  Folder,
  FileText,
  Trash2,
  FolderOpen,
  Info,
  ExternalLink,
  CheckCircle,
  X
} from 'lucide-react';
import { FavoriteRecord, FileRecord } from '../types';

interface FavoritesPageProps {
  favorites: FavoriteRecord[];
  onRemoveFavorite: (id: string) => void;
  onAddFavorite: (path: string, type: number, alias?: string) => void;
  onOpenFileByPath: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
}

export const FavoritesPage: React.FC<FavoritesPageProps> = ({
  favorites,
  onRemoveFavorite,
  onAddFavorite,
  onOpenFileByPath,
  onOpenInExplorer,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newType, setNewType] = useState<number>(1); // 0 = file, 1 = folder
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;

    onAddFavorite(newPath.trim(), newType, newAlias.trim() || undefined);
    setNewPath('');
    setNewAlias('');
    setIsAddModalOpen(false);
    showToast('已成功添加新收藏 ⭐');
  };

  return (
    <div id="favorites-page" className="p-6 space-y-4 max-w-6xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-500">
            <Star className="w-4 h-4 fill-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              我的收藏
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              固定常用文件与核心工程目录，支持秒级直达与快速打开
            </p>
          </div>
        </div>

        <button
          id="add-favorite-btn"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加收藏</span>
        </button>
      </div>

      {/* Favorites List Container */}
      <div className="flex-1 min-h-[400px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs overflow-y-auto">
        <div className="space-y-2">
          {favorites.length > 0 ? (
            favorites.map((fav) => (
              <div
                key={fav.id}
                id={`favorite-item-${fav.id}`}
                className="p-3 rounded-lg bg-neutral-50/60 dark:bg-[#222]/80 border border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 hover:shadow-xs transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-white dark:bg-[#333] flex items-center justify-center border border-black/10 dark:border-white/10 shrink-0">
                    {fav.targetType === 1 ? (
                      <Folder className="w-4 h-4 text-amber-500" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-xs text-[#1c1c1c] dark:text-[#f3f3f3] truncate">
                      {fav.displayAlias || fav.targetPath.split('\\').pop() || fav.targetPath}
                    </h3>
                    <p className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 truncate max-w-xl">
                      {fav.targetPath}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      if (fav.targetType === 1) {
                        onOpenInExplorer(fav.targetPath);
                      } else {
                        onOpenFileByPath(fav.targetPath);
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-[#0078d4] hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>打开</span>
                  </button>

                  <button
                    onClick={() => onOpenInExplorer(fav.targetPath)}
                    className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="在资源管理器中定位"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      onRemoveFavorite(fav.id);
                      showToast('已从收藏夹移除');
                    }}
                    className="p-1.5 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="删除此收藏"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <Star className="w-12 h-12 stroke-1 mb-2 text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">收藏夹空空如也</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs">
                在文件搜索结果或目录树中点击星标 ⭐，即可快速将文件或文件夹添加到此处
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Favorite Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#2b2b2b] rounded-xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <h3 className="font-semibold text-sm text-[#1c1c1c] dark:text-[#f3f3f3]">添加自定义收藏</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                  目标类型
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="fav-type"
                      checked={newType === 1}
                      onChange={() => setNewType(1)}
                      className="text-[#0078d4]"
                    />
                    <span>📁 文件夹</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="fav-type"
                      checked={newType === 0}
                      onChange={() => setNewType(0)}
                      className="text-[#0078d4]"
                    />
                    <span>📄 单个文件</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                  完整路径 *
                </label>
                <input
                  type="text"
                  required
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder={newType === 1 ? '例如: D:\\Projects\\Work' : '例如: D:\\Docs\\Plan.docx'}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 dark:border-white/15 bg-neutral-50 dark:bg-[#202020] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#0078d4]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                  显示别名（可选）
                </label>
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="例如: 我的主工作区"
                  className="w-full px-3 py-2 rounded-lg border border-black/15 dark:border-white/15 bg-neutral-50 dark:bg-[#202020] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#0078d4]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#0078d4] hover:bg-[#006cbd] text-white font-medium shadow-xs cursor-pointer"
                >
                  保存收藏
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast popup */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
