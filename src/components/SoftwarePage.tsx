import React, { useState } from 'react';
import {
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Play,
  FolderOpen,
  CheckCircle,
  Building,
  HardDrive,
  Info
} from 'lucide-react';
import { SoftwareRecord } from '../types';

interface SoftwarePageProps {
  softwareList: SoftwareRecord[];
  isScanning: boolean;
  onRescan: () => Promise<void>;
  onLaunchSoftware: (soft: SoftwareRecord) => void;
  onOpenInstallFolder: (soft: SoftwareRecord) => void;
}

export const SoftwarePage: React.FC<SoftwarePageProps> = ({
  softwareList,
  isScanning,
  onRescan,
  onLaunchSoftware,
  onOpenInstallFolder,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredSoftware = softwareList.filter(s => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      s.publisher.toLowerCase().includes(q) ||
      s.version.toLowerCase().includes(q) ||
      s.installLocation.toLowerCase().includes(q)
    );
  });

  return (
    <div id="software-page" className="p-6 space-y-4 max-w-6xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                我的软件
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-[#0078d4] dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                已扫描 {softwareList.length} 款
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              本地注册表与开始菜单已安装应用程序、数字签名与快速启动
            </p>
          </div>
        </div>

        <button
          id="software-rescan-btn"
          disabled={isScanning}
          onClick={async () => {
            await onRescan();
            showToast('已完成 Windows 注册表与安装目录重新扫描 ✅');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? '扫描中...' : '重新扫描'}</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input
          type="text"
          id="software-search-input"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="快速搜索已安装软件名称、发布商或版本号..."
          className="w-full pl-10 pr-10 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#2b2b2b] text-[#1c1c1c] dark:text-[#f3f3f3] text-xs placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0078d4]/30 focus:border-[#0078d4] shadow-xs"
        />
      </div>

      {/* Software List Container */}
      <div className="flex-1 min-h-[400px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSoftware.map((soft) => (
            <div
              key={soft.id}
              id={`software-card-${soft.id}`}
              className="p-3.5 rounded-lg bg-neutral-50/60 dark:bg-[#222]/80 border border-black/5 dark:border-white/5 hover:border-[#0078d4]/40 hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-white dark:bg-[#333] flex items-center justify-center border border-black/10 dark:border-white/10 shrink-0 text-[#0078d4]">
                      <Package className="w-4 h-4" />
                    </div>
                    <h3 className="font-semibold text-xs text-[#1c1c1c] dark:text-[#f3f3f3] truncate">
                      {soft.displayName}
                    </h3>
                  </div>

                  {soft.isSigned ? (
                    <div
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium border border-emerald-200 dark:border-emerald-800 shrink-0"
                      title={soft.signerName}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>已签名</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-[10px] font-medium border border-amber-200 dark:border-amber-800 shrink-0">
                      <ShieldAlert className="w-3 h-3" />
                      <span>未签名</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 pl-9">
                  <div className="flex items-center gap-1.5">
                    <Building className="w-3 h-3 shrink-0" />
                    <span className="truncate">{soft.publisher}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">•</span>
                    <span className="font-mono text-neutral-600 dark:text-neutral-300">v{soft.version}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400 truncate">
                    <HardDrive className="w-3 h-3 shrink-0" />
                    <span className="truncate">{soft.installLocation || soft.mainExePath}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5 pl-9">
                <button
                  onClick={() => onOpenInstallFolder(soft)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3 text-amber-500" />
                  <span>定位目录</span>
                </button>
                <button
                  onClick={() => {
                    onLaunchSoftware(soft);
                    showToast(`已启动：${soft.displayName}`);
                  }}
                  className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-2xs"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>启动</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toast message */}
      {toastMessage && (
        <div
          id="software-toast"
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};
