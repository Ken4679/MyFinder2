import React, { useState, useEffect } from 'react';
import {
  Package,
  RefreshCw,
  Search,
  Play,
  FolderOpen,
  Building,
  HardDrive,
  Info,
  Calendar,
  Layers,
  FileCode,
  Copy,
  Check,
  X,
  Database,
  Shield,
  Trash2,
  History
} from 'lucide-react';
import { AuditLogEntry, SoftwareRecord } from '../types';
import { formatBytes } from '../services/storageService';
import { UninstallWizardModal } from './UninstallWizardModal';
import { SecurityAssessmentModal } from './SecurityAssessmentModal';
import { tauriBridge } from '../services/tauriBridge';

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
  const [archFilter, setArchFilter] = useState<'all' | 'x64' | 'x86' | 'user'>('all');
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareRecord | null>(null);
  const [securityInspectTarget, setSecurityInspectTarget] = useState<SoftwareRecord | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<SoftwareRecord | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadAuditLogs = async () => {
    const logs = await tauriBridge.readUninstallAuditLogs();
    setAuditLogs(logs);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    showToast(`已复制${label}到剪贴板`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredSoftware = softwareList.filter(s => {
    // Architecture / Source filter
    if (archFilter === 'x64') {
      if (s.architecture !== 'x64' && !s.source.includes('64-bit')) return false;
    } else if (archFilter === 'x86') {
      if (s.architecture !== 'x86' && !s.source.includes('32-bit')) return false;
    } else if (archFilter === 'user') {
      if (!s.source.includes('HKCU') && !s.source.includes('User')) return false;
    }

    // Text search
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      (s.publisher && s.publisher.toLowerCase().includes(q)) ||
      (s.version && s.version.toLowerCase().includes(q)) ||
      (s.installLocation && s.installLocation.toLowerCase().includes(q)) ||
      (s.registryKey && s.registryKey.toLowerCase().includes(q))
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
              实时枚举 Windows 注册表（HKLM 64/32位 与 HKCU 当前用户）已安装应用与元数据
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="software-audit-logs-btn"
            onClick={async () => {
              await loadAuditLogs();
              setShowAuditLogs(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>卸载审计日志</span>
          </button>

          <button
            id="software-rescan-btn"
            disabled={isScanning}
            onClick={async () => {
              await onRescan();
              showToast('已完成 Windows 注册表重新扫描 ✅');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? '扫描中...' : '重新扫描'}</span>
          </button>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            id="software-search-input"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="快速搜索已安装软件名称、发布商或版本号..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#2b2b2b] text-[#1c1c1c] dark:text-[#f3f3f3] text-xs placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0078d4]/30 focus:border-[#0078d4] shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 bg-white dark:bg-[#2b2b2b] p-1 rounded-xl border border-black/10 dark:border-white/10 text-xs">
          <button
            onClick={() => setArchFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              archFilter === 'all'
                ? 'bg-[#0078d4] text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            全部 ({softwareList.length})
          </button>
          <button
            onClick={() => setArchFilter('x64')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              archFilter === 'x64'
                ? 'bg-[#0078d4] text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            64-bit
          </button>
          <button
            onClick={() => setArchFilter('x86')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              archFilter === 'x86'
                ? 'bg-[#0078d4] text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            32-bit
          </button>
          <button
            onClick={() => setArchFilter('user')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              archFilter === 'user'
                ? 'bg-[#0078d4] text-white shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            当前用户
          </button>
        </div>
      </div>

      {/* Software List Container */}
      <div className="flex-1 min-h-[400px] rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 p-4 shadow-xs overflow-y-auto">
        {filteredSoftware.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
            <Package className="w-12 h-12 stroke-[1.5] mb-2 opacity-50" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">未找到匹配的已安装软件</p>
            <p className="text-xs text-neutral-400 mt-1">请尝试修改搜索词或重置架构过滤条件</p>
          </div>
        ) : (
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
                      <h3 className="font-semibold text-xs text-[#1c1c1c] dark:text-[#f3f3f3] truncate" title={soft.displayName}>
                        {soft.displayName}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {soft.architecture && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-black/5 dark:border-white/5">
                          {soft.architecture}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-[#0078d4] dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60">
                        {soft.source.includes('HKCU') ? '用户级' : '系统级'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 pl-9">
                    <div className="flex items-center gap-1.5">
                      <Building className="w-3 h-3 shrink-0" />
                      <span className="truncate">{soft.publisher || '未知发布商'}</span>
                      {soft.version && (
                        <>
                          <span className="text-neutral-300 dark:text-neutral-600">•</span>
                          <span className="font-mono text-neutral-600 dark:text-neutral-300 truncate">v{soft.version}</span>
                        </>
                      )}
                    </div>

                    {(soft.installLocation || soft.mainExePath) && (
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400 truncate">
                        <HardDrive className="w-3 h-3 shrink-0" />
                        <span className="truncate">{soft.installLocation || soft.mainExePath}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-neutral-400 pt-0.5">
                      {soft.installDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5 shrink-0" />
                          <span>{soft.installDate}</span>
                        </div>
                      )}
                      {soft.estimatedSize && (
                        <div className="flex items-center gap-1">
                          <Database className="w-2.5 h-2.5 shrink-0" />
                          <span>预估 {formatBytes(soft.estimatedSize)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5 pl-9">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSecurityInspectTarget(soft)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                    >
                      <Shield className="w-3 h-3" />
                      <span>信任审计</span>
                    </button>
                    <button
                      onClick={() => setSelectedSoftware(soft)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3" />
                      <span>元数据</span>
                    </button>
                    <button
                      onClick={() => setUninstallTarget(soft)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>安全卸载</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(soft.installLocation || soft.mainExePath) && (
                      <button
                        onClick={() => onOpenInstallFolder(soft)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <FolderOpen className="w-3 h-3 text-amber-500" />
                        <span>定位目录</span>
                      </button>
                    )}
                    {soft.mainExePath && (
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
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata & Uninstall Info Inspection Modal */}
      {selectedSoftware && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-[#2b2b2b] rounded-2xl shadow-xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] truncate">
                    {selectedSoftware.displayName}
                  </h2>
                  <p className="text-[11px] text-neutral-400">Windows 安装与卸载注册表元数据</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSoftware(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3 overflow-y-auto text-xs">
              {/* Basic grid info */}
              <div className="grid grid-cols-2 gap-2 bg-neutral-50 dark:bg-[#222] p-3 rounded-xl border border-black/5 dark:border-white/5">
                <div>
                  <span className="text-neutral-400 block text-[10px]">发布商 (Publisher)</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {selectedSoftware.publisher || '未提供'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">版本 (DisplayVersion)</span>
                  <span className="font-mono text-neutral-700 dark:text-neutral-200">
                    {selectedSoftware.version || '未提供'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">架构与视图 (Architecture)</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {selectedSoftware.architecture || '默认'} ({selectedSoftware.source})
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">安装日期 (InstallDate)</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {selectedSoftware.installDate || '未记录'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">预估体积 (EstimatedSize)</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {selectedSoftware.estimatedSize ? formatBytes(selectedSoftware.estimatedSize) : '未提供'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">注册表子键名 (Registry Key)</span>
                  <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-200 truncate block" title={selectedSoftware.registryKey || ''}>
                    {selectedSoftware.registryKey || '无'}
                  </span>
                </div>
              </div>

              {/* Install Location */}
              {selectedSoftware.installLocation && (
                <div className="space-y-1">
                  <span className="text-neutral-400 block text-[11px] font-medium">安装路径 (InstallLocation)</span>
                  <div className="p-2 rounded-lg bg-neutral-50 dark:bg-[#222] border border-black/5 dark:border-white/5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 break-all flex items-center justify-between">
                    <span>{selectedSoftware.installLocation}</span>
                    <button
                      onClick={() => copyToClipboard(selectedSoftware.installLocation!, '安装路径')}
                      className="p-1 text-neutral-400 hover:text-[#0078d4] cursor-pointer"
                    >
                      {copiedKey === '安装路径' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Uninstall String */}
              {selectedSoftware.uninstallCommand && (
                <div className="space-y-1">
                  <span className="text-neutral-400 block text-[11px] font-medium">标准卸载命令 (UninstallString)</span>
                  <div className="p-2 rounded-lg bg-neutral-50 dark:bg-[#222] border border-black/5 dark:border-white/5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 break-all flex items-center justify-between">
                    <span>{selectedSoftware.uninstallCommand}</span>
                    <button
                      onClick={() => copyToClipboard(selectedSoftware.uninstallCommand!, '卸载命令')}
                      className="p-1 text-neutral-400 hover:text-[#0078d4] cursor-pointer shrink-0"
                    >
                      {copiedKey === '卸载命令' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Quiet Uninstall String */}
              {selectedSoftware.quietUninstallCommand && (
                <div className="space-y-1">
                  <span className="text-neutral-400 block text-[11px] font-medium">静默卸载命令 (QuietUninstallString)</span>
                  <div className="p-2 rounded-lg bg-neutral-50 dark:bg-[#222] border border-black/5 dark:border-white/5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 break-all flex items-center justify-between">
                    <span>{selectedSoftware.quietUninstallCommand}</span>
                    <button
                      onClick={() => copyToClipboard(selectedSoftware.quietUninstallCommand!, '静默卸载命令')}
                      className="p-1 text-neutral-400 hover:text-[#0078d4] cursor-pointer shrink-0"
                    >
                      {copiedKey === '静默卸载命令' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Safety notice banner */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300 text-[11px] leading-relaxed">
                <p className="font-semibold mb-0.5">🔒 MyFinder 绝对只读安全保护</p>
                <p className="text-neutral-600 dark:text-neutral-400">
                  当前处于只读发现与检查阶段。上述卸载命令由软件注册表提供，仅供管理员查阅。MyFinder 严守不擅自执行外部破坏性命令的铁律。
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-50 dark:bg-[#222] border-t border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const target = selectedSoftware;
                    setSelectedSoftware(null);
                    setSecurityInspectTarget(target);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer border border-blue-200/60 dark:border-blue-800/60"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>信任与签名审计</span>
                </button>
                <button
                  onClick={() => {
                    const target = selectedSoftware;
                    setSelectedSoftware(null);
                    setUninstallTarget(target);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer border border-rose-200/60 dark:border-rose-800/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>安全卸载向导</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedSoftware(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] text-white hover:bg-[#006cbd] transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 5 Security & Trust Assessment Modal for Software */}
      {securityInspectTarget && (
        <SecurityAssessmentModal
          targetPath={
            securityInspectTarget.installLocation ||
            securityInspectTarget.mainExePath ||
            `C:\\Program Files\\${securityInspectTarget.displayName}\\${securityInspectTarget.displayName}.exe`
          }
          targetName={securityInspectTarget.displayName}
          onClose={() => setSecurityInspectTarget(null)}
        />
      )}

      {/* Phase 4 Safe Uninstall & Leftover Wizard Modal */}
      {uninstallTarget && (
        <UninstallWizardModal
          software={uninstallTarget}
          onClose={() => setUninstallTarget(null)}
          onFinishedAndRefresh={async () => {
            await onRescan();
            showToast('已完成卸载与清理流程，软件清单已同步刷新 ✅');
          }}
        />
      )}

      {/* Audit Logs Modal */}
      {showAuditLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white dark:bg-[#252525] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-neutral-50/50 dark:bg-[#202020]/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                    卸载与清理安全审计日志
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    本地记录于 `.myfinder/logs/uninstall_audit.jsonl`
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-2.5 text-xs">
              {auditLogs.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400">
                  <History className="w-8 h-8 opacity-40 mb-2" />
                  <p className="text-xs">暂无卸载或清理审计记录</p>
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {log.softwareName}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {log.timestamp}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-100 dark:bg-blue-900/40 text-[#0078d4] dark:text-blue-300">
                        {log.action}
                      </span>
                      <span className="text-neutral-600 dark:text-neutral-400 text-[11px]">
                        {log.details}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-[#202020] border-t border-black/5 dark:border-white/5 flex items-center justify-end">
              <button
                onClick={() => setShowAuditLogs(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] text-white hover:bg-[#006cbd] transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
