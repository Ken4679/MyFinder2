import React, { useState, useEffect } from 'react';
import {
  Package,
  Shield,
  CheckCircle2,
  FolderOpen,
  Copy,
  Check,
  X,
  Search,
  HardDrive,
  Info,
  RefreshCw,
  Layers,
  FileCode,
  FileCheck,
} from 'lucide-react';
import {
  SoftwareRecord,
  LeftoverCandidate,
  UninstallPrecheckInfo,
} from '../types';
import { tauriBridge } from '../services/tauriBridge';
import { formatBytes } from '../services/storageService';

interface ResidualInspectionModalProps {
  software: SoftwareRecord;
  onClose: () => void;
  onFinishedAndRefresh?: () => Promise<void>;
}

export const ResidualInspectionModal: React.FC<ResidualInspectionModalProps> = ({
  software,
  onClose,
}) => {
  const [precheckInfo, setPrecheckInfo] = useState<UninstallPrecheckInfo | null>(null);
  const [candidates, setCandidates] = useState<LeftoverCandidate[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'directory' | 'file' | 'registryKey' | 'shortcut'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('已复制路径到剪贴板');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const runAnalysis = async () => {
    setIsScanning(true);
    try {
      const [info, detected] = await Promise.all([
        tauriBridge.precheckSoftwareUninstall(software),
        tauriBridge.detectSoftwareLeftovers(software),
      ]);
      setPrecheckInfo(info);
      setCandidates(detected);
    } catch (err) {
      console.error('Failed to inspect residuals', err);
      showToast('残留与关联项分析出错');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    runAnalysis();
  }, [software]);

  const filteredCandidates = candidates.filter((c) => {
    if (filterType === 'all') return true;
    return c.itemType === filterType;
  });

  const totalSize = candidates.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#252525] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-neutral-50/50 dark:bg-[#202020]/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                  关联文件与残留痕迹分析 (只读)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  纯只读排查
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {software.displayName} • 深度排查目录、用户配置、快捷方式与注册表痕迹
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Read-Only Safety Notice Banner */}
        <div className="px-5 py-2.5 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-xs text-blue-900 dark:text-blue-300">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#0078d4] shrink-0" />
            <span>
              <strong>只读安全保证：</strong>MyFinder 仅对磁盘与注册表痕迹进行关联检测与呈现，绝不执行任何删除或篡改。
            </span>
          </div>
          <button
            onClick={runAnalysis}
            disabled={isScanning}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-[#0078d4] dark:text-blue-200 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
            <span>重新分析</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 bg-neutral-50 dark:bg-[#1f1f1f] p-3 rounded-xl border border-black/5 dark:border-white/5">
            <div>
              <span className="text-neutral-400 block text-[10px]">关联项目总数</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                {candidates.length} 项
              </span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[10px]">估算磁盘占用</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                {totalSize > 0 ? formatBytes(totalSize) : '无明显文件'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[10px]">运行状态</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                {precheckInfo?.isRunning ? (
                  <span className="text-amber-500 font-normal text-xs">⚠️ 关联进程正在运行</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs">未检测到活动进程</span>
                )}
              </span>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#0078d4] text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                全部 ({candidates.length})
              </button>
              <button
                onClick={() => setFilterType('directory')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  filterType === 'directory'
                    ? 'bg-[#0078d4] text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                目录 ({candidates.filter((c) => c.itemType === 'directory').length})
              </button>
              <button
                onClick={() => setFilterType('shortcut')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  filterType === 'shortcut'
                    ? 'bg-[#0078d4] text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                快捷方式 ({candidates.filter((c) => c.itemType === 'shortcut').length})
              </button>
              <button
                onClick={() => setFilterType('registryKey')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  filterType === 'registryKey'
                    ? 'bg-[#0078d4] text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                注册表项 ({candidates.filter((c) => c.itemType === 'registryKey').length})
              </button>
            </div>
          </div>

          {/* List of candidates */}
          {isScanning ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0078d4]" />
              <span>正在排查关联路径与残留记录...</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="py-10 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 stroke-[1.5] mb-2" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                未检测到该分类下的残留或关联项
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">系统路径与注册表均较为整洁。</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-3 rounded-xl border bg-neutral-50 dark:bg-[#1f1f1f] border-black/5 dark:border-white/5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {cand.itemType === 'directory'
                            ? '目录'
                            : cand.itemType === 'shortcut'
                            ? '快捷方式'
                            : cand.itemType === 'registryKey'
                            ? '注册表'
                            : '文件'}
                        </span>
                        <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200 break-all text-xs">
                          {cand.path}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {cand.sizeBytes != null && (
                        <span className="font-mono text-[10px] text-neutral-400">
                          {formatBytes(cand.sizeBytes)}
                        </span>
                      )}

                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          cand.confidence === 'high'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                            : cand.confidence === 'medium'
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {cand.confidence === 'high'
                          ? '高匹配'
                          : cand.confidence === 'medium'
                          ? '中匹配'
                          : '弱匹配'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pl-1">
                    🔍 {cand.reason}
                  </p>

                  <div className="flex items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => copyText(cand.path, cand.id)}
                      className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-[#0078d4] cursor-pointer"
                    >
                      {copiedId === cand.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>复制路径</span>
                    </button>

                    {cand.itemType !== 'registryKey' && (
                      <button
                        type="button"
                        onClick={() => tauriBridge.revealInExplorerNative(cand.path)}
                        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-500 cursor-pointer ml-2"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                        <span>在资源管理器中定位</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 dark:bg-[#202020] border-t border-black/5 dark:border-white/5 flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            共列出 {filteredCandidates.length} 项排查结果
          </span>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-xs"
          >
            关闭
          </button>
        </div>
      </div>

      {/* Toast message */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export const UninstallWizardModal = ResidualInspectionModal;

