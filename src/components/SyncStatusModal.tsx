import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Zap,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  X,
  Clock,
  Layers,
  AlertTriangle,
  Info,
  SlidersHorizontal
} from 'lucide-react';
import { SyncStatusInfo, IncrementalSyncResult } from '../types';
import { tauriBridge } from '../services/tauriBridge';

interface SyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<IncrementalSyncResult | null>(null);
  const [forceReconcile, setForceReconcile] = useState(false);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const res = await tauriBridge.getSyncStatus();
      setSyncStatus(res);
    } catch (err) {
      console.error('Failed to load sync status', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTriggerSync = async (volumePath?: string) => {
    setIsSyncing(true);
    setLastResult(null);
    try {
      const res = await tauriBridge.triggerIncrementalSync(volumePath, forceReconcile);
      setLastResult(res);
      await loadStatus();
      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err) {
      console.error('Trigger sync error', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      id="sync-status-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="sync-status-modal"
        className="w-full max-w-2xl bg-white dark:bg-[#2b2b2b] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5 bg-neutral-50/50 dark:bg-[#202020]/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] flex items-center gap-2">
                <span>NTFS USN Journal 极速增量文件同步</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                  Everything 级性能
                </span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                运行期利用 Windows 变更通知，离线期读取 NTFS USN 日志，启动即秒级对齐
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Overall State Card */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 dark:text-neutral-400 font-medium">当前同步状态</span>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>{syncStatus?.overallState === 'synced' ? '已完全同步 (Synced)' : syncStatus?.overallState || '已对齐'}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-neutral-600 dark:text-neutral-300">
              <div className="p-2 rounded-lg bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5">
                <span className="text-[10px] text-neutral-400">同步机制</span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px] truncate">
                  {syncStatus?.syncMethod || 'NTFS USN Journal'}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5">
                <span className="text-[10px] text-neutral-400">实时监听器</span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px]">
                  {syncStatus?.isWatching ? '运行中 (ReadDirectory)' : '未激活'}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5">
                <span className="text-[10px] text-neutral-400">累计处理变更</span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px]">
                  {syncStatus?.changesProcessedCount ?? 0} 项
                </p>
              </div>

              <div className="p-2 rounded-lg bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5">
                <span className="text-[10px] text-neutral-400">后台常驻进程</span>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                  0 (无后台常驻)
                </p>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              💡 <strong>设计理念：</strong>MyFinder 严格遵循只读原则，不产生任何后台常驻服务。关闭期间的文件变更由 Windows NTFS 驱动原生记录在 USN Change Journal 中，重新打开软件时仅需几毫秒即可增量提取变化，无需重新全盘扫描。
            </p>
          </div>

          {/* Volume USN Records List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#0078d4]" />
                <span>NTFS 卷状态与 USN Journal 检查点</span>
              </span>
              <button
                onClick={loadStatus}
                disabled={isLoading}
                className="text-[11px] text-[#0078d4] hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>刷新状态</span>
              </button>
            </h3>

            {syncStatus?.volumes && syncStatus.volumes.length > 0 ? (
              <div className="space-y-2">
                {syncStatus.volumes.map((vol, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-mono font-bold">
                          {vol.volumePath}
                        </span>
                        <span className="text-neutral-700 dark:text-neutral-200 font-medium">
                          格式: {vol.fileSystem}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          序列号: {vol.volumeSerial}
                        </span>
                      </div>

                      <button
                        onClick={() => handleTriggerSync(vol.volumePath)}
                        disabled={isSyncing}
                        className="px-2.5 py-1 rounded-lg bg-[#0078d4] hover:bg-[#006cbd] text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>增量对齐此卷</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-white dark:bg-[#2b2b2b] p-2 rounded-lg border border-black/5 dark:border-white/5">
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Journal ID</span>
                        <span className="text-neutral-700 dark:text-neutral-300 font-semibold truncate block">
                          0x{vol.journalId.toString(16).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Last USN 检查点</span>
                        <span className="text-neutral-700 dark:text-neutral-300 font-semibold truncate block">
                          {vol.lastUsn.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">最低有效 USN</span>
                        <span className="text-neutral-700 dark:text-neutral-300 font-semibold truncate block">
                          {vol.lowestValidUsn.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {vol.statusMessage && (
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        {vol.statusMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 text-center text-neutral-400">
                暂无卷同步记录，点击下方按钮立即初始化 NTFS USN 同步
              </div>
            )}
          </div>

          {/* Sync Result Banner */}
          {lastResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 animate-in fade-in duration-150 ${
                lastResult.success
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-xs flex items-center gap-2">
                  <span>{lastResult.message}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10">
                    耗时: {lastResult.elapsedMs} ms
                  </span>
                </div>
                <div className="text-[11px] text-neutral-600 dark:text-neutral-300 flex items-center gap-3">
                  <span>新增: {lastResult.createsCount}</span>
                  <span>修改: {lastResult.updatesCount}</span>
                  <span>删除: {lastResult.deletesCount}</span>
                  <span>机制: {lastResult.methodUsed}</span>
                </div>
              </div>
            </div>
          )}

          {/* Sync Actions & Reconciliation Toggle */}
          <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={forceReconcile}
                  onChange={(e) => setForceReconcile(e.target.checked)}
                  className="rounded border-neutral-400 text-[#0078d4] focus:ring-[#0078d4]"
                />
                <span className="font-medium">深度时间戳对齐核验 (Reconciliation Mode)</span>
              </label>
              <span className="text-[10px] text-neutral-400">
                {forceReconcile ? '跳过 USN 直接全树核验' : '优先 NTFS USN 极速增量'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                id="modal-trigger-sync-btn"
                onClick={() => handleTriggerSync()}
                disabled={isSyncing}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-[#0078d4] hover:bg-[#006cbd] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? '正在极速同步中...' : '立即执行极速增量同步'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-50 dark:bg-[#202020] border-t border-black/5 dark:border-white/5 flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>严格只读保障：不修改用户任何物理文件</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1 rounded-lg bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
