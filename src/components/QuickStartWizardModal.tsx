import React, { useState } from 'react';
import { X, Rocket, Folder, CheckCircle, Loader2 } from 'lucide-react';

interface QuickStartWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartIndexing: (targetPath: string, includeSubfolders: boolean) => Promise<void>;
}

export const QuickStartWizardModal: React.FC<QuickStartWizardModalProps> = ({
  isOpen,
  onClose,
  onStartIndexing,
}) => {
  const [selectedOption, setSelectedOption] = useState<'docs' | 'desktop' | 'custom'>('docs');
  const [customPath, setCustomPath] = useState('D:\\Projects\\Workspace');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleStart = async () => {
    let target = 'D:\\Documents';
    if (selectedOption === 'desktop') target = 'D:\\Desktop';
    if (selectedOption === 'custom') target = customPath.trim() || 'D:\\Workspace';

    setIsProcessing(true);
    setStatusMessage('正在初始化本地高速文件扫描引擎...');
    setProgress(20);

    await new Promise(r => setTimeout(r, 400));
    setStatusMessage(`正在扫描目录：${target}...`);
    setProgress(60);

    await new Promise(r => setTimeout(r, 400));
    setStatusMessage('正在建立倒排索引数据库...');
    setProgress(90);

    await onStartIndexing(target, includeSubfolders);
    setProgress(100);
    setStatusMessage('索引构建完成 ✅');

    await new Promise(r => setTimeout(r, 300));
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        id="quick-start-wizard-modal"
        className="w-full max-w-md bg-white dark:bg-[#2b2b2b] rounded-xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#1c1c1c] dark:text-[#f3f3f3]">
                快速索引向导
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">选择要扫描并索引的本地目录</p>
            </div>
          </div>
          {!isProcessing && (
            <button
              id="close-wizard-btn"
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-sm">
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            选择要索引的目录，MyFinder 将自动扫描这些位置的文件，并在后台建立高速全文检索索引。
          </p>

          {/* Radio Options */}
          <div className="space-y-2">
            <label
              onClick={() => setSelectedOption('docs')}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOption === 'docs'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="wizard-path"
                checked={selectedOption === 'docs'}
                onChange={() => setSelectedOption('docs')}
                className="text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                📁 我的文档 (Documents)
              </span>
            </label>

            <label
              onClick={() => setSelectedOption('desktop')}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOption === 'desktop'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="wizard-path"
                checked={selectedOption === 'desktop'}
                onChange={() => setSelectedOption('desktop')}
                className="text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                🖥️ 桌面 (Desktop)
              </span>
            </label>

            <label
              onClick={() => setSelectedOption('custom')}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOption === 'custom'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="wizard-path"
                checked={selectedOption === 'custom'}
                onChange={() => setSelectedOption('custom')}
                className="text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                📂 自定义目录...
              </span>
            </label>
          </div>

          {/* Custom Path Input */}
          {selectedOption === 'custom' && (
            <div className="pt-1">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                自定义路径：
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="wizard-custom-path-input"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="例如: D:\Projects\Workspace"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-neutral-50 dark:bg-[#202020] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#0078d4]"
                />
              </div>
            </div>
          )}

          {/* Subfolders Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                id="wizard-subfolders-checkbox"
                checked={includeSubfolders}
                onChange={(e) => setIncludeSubfolders(e.target.checked)}
                className="rounded border-neutral-400 text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span>包含子文件夹（递归索引所有子目录）</span>
            </label>
          </div>

          {/* Progress state */}
          {isProcessing && (
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800/50 space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-medium">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {statusMessage}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0078d4] transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-neutral-100/70 dark:bg-neutral-800/60 border-t border-black/5 dark:border-white/5">
          <button
            id="wizard-cancel-btn"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors cursor-pointer"
          >
            稍后
          </button>
          <button
            id="wizard-start-btn"
            disabled={isProcessing}
            onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] disabled:opacity-50 text-white shadow-xs transition-colors cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在索引...</span>
              </>
            ) : (
              <span>开始索引</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
