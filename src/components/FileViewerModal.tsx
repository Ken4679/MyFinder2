import React from 'react';
import {
  X,
  FileText,
  Folder,
  Calendar,
  HardDrive,
  Star,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Tag,
  Info
} from 'lucide-react';
import { FileRecord, FileCategory } from '../types';
import { formatBytes } from '../services/storageService';
import { getFileSafetyInfo } from '../services/fileSafetyService';

interface FileViewerModalProps {
  file: FileRecord | null;
  isFavorite: boolean;
  onToggleFavorite: (file: FileRecord) => void;
  onClose: () => void;
  onOpenInExplorer?: (file: FileRecord) => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  file,
  isFavorite,
  onToggleFavorite,
  onClose,
  onOpenInExplorer,
}) => {
  if (!file) return null;

  const safetyInfo = getFileSafetyInfo(file.extension, file.path);

  const getCategoryName = (cat: FileCategory) => {
    switch (cat) {
      case FileCategory.Document: return '文档文件 (Document)';
      case FileCategory.Image: return '图像文件 (Image)';
      case FileCategory.Audio: return '音频媒体 (Audio)';
      case FileCategory.Video: return '视频媒体 (Video)';
      case FileCategory.Executable: return '可执行程序 (Executable)';
      case FileCategory.Config: return '配置文件 (Configuration)';
      case FileCategory.Temp: return '临时与日志 (Log/Temp)';
      default: return '常规文件 (File)';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        id="file-viewer-modal"
        className="w-full max-w-xl bg-white dark:bg-[#2b2b2b] rounded-xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#1c1c1c] dark:text-[#f3f3f3] truncate max-w-[340px]">
                {file.fileName}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">文件属性、内容预览与安全指南</p>
            </div>
          </div>
          <button
            id="close-file-viewer-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-sm overflow-y-auto flex-1">
          {/* Layman File Safety Card */}
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-2 ${
              safetyInfo.level === 'danger'
                ? 'bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100'
                : safetyInfo.level === 'caution'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                {safetyInfo.level === 'danger' ? (
                  <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
                ) : safetyInfo.level === 'caution' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>小白安全评估：{safetyInfo.typeName}</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  safetyInfo.level === 'danger'
                    ? 'bg-red-500 text-white'
                    : safetyInfo.level === 'caution'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {safetyInfo.levelBadge}
              </span>
            </div>

            <p className="opacity-90">{safetyInfo.description}</p>

            <div className="pt-1.5 border-t border-black/5 dark:border-white/10 flex flex-col gap-1">
              <div>
                <span className="font-semibold opacity-80">能不能删除？</span> {safetyInfo.deletionSafety}
              </div>
              <div>
                <span className="font-semibold opacity-80">推荐打开方式：</span> {safetyInfo.openRecommendation}
              </div>
            </div>
          </div>

          {/* File path box */}
          <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <Folder className="w-3.5 h-3.5" />
                <span>文件完整路径（安全只读）</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(file.path);
                }}
                className="text-[11px] text-[#0078d4] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>复制路径</span>
              </button>
            </div>
            <p className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all select-text">
              {file.path}
            </p>
          </div>

          {/* Key specs grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                <HardDrive className="w-3.5 h-3.5" />
                <span>文件大小</span>
              </div>
              <p className="font-medium text-neutral-800 dark:text-neutral-200">
                {formatBytes(file.sizeBytes)}
              </p>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                <Tag className="w-3.5 h-3.5" />
                <span>分类类别</span>
              </div>
              <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                {getCategoryName(file.category)}
              </p>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>创建时间</span>
              </div>
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {new Date(file.createdTime).toLocaleString('zh-CN')}
              </p>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>最后修改</span>
              </div>
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {new Date(file.updatedTime).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>

          {/* Content snippet if any */}
          {file.contentSnippet && (
            <div className="p-3 bg-neutral-50 dark:bg-[#222] rounded-lg border border-black/5 dark:border-white/5">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                📄 索引内容摘要 / 文本预览
              </p>
              <p className="text-xs text-neutral-700 dark:text-neutral-300 font-mono bg-white dark:bg-[#1a1a1a] p-2.5 rounded border border-black/5 dark:border-white/5 max-h-24 overflow-y-auto whitespace-pre-wrap">
                {file.contentSnippet}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-100/70 dark:bg-neutral-800/60 border-t border-black/5 dark:border-white/5 shrink-0">
          <button
            id="toggle-fav-modal-btn"
            onClick={() => onToggleFavorite(file)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              isFavorite
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                : 'bg-white dark:bg-[#333] hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-black/10 dark:border-white/10'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>{isFavorite ? '已在收藏夹中' : '添加至收藏'}</span>
          </button>

          <div className="flex items-center gap-2">
            {onOpenInExplorer && (
              <button
                id="modal-locate-btn"
                onClick={() => {
                  onOpenInExplorer(file);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#333] hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-black/10 dark:border-white/10 transition-colors cursor-pointer"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>在资源管理器中定位</span>
              </button>
            )}
            <button
              id="close-modal-btn"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white shadow-xs transition-colors cursor-pointer"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
