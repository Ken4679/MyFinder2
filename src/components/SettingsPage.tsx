import React, { useState } from 'react';
import {
  Settings,
  Sun,
  Moon,
  Laptop,
  Sparkles,
  Folder,
  Plus,
  Trash2,
  Rocket,
  HardDrive,
  Database,
  ShieldCheck,
  CheckCircle,
  RefreshCw,
  Sliders,
  Info,
  Zap
} from 'lucide-react';
import { AppSettings, ElementThemeMode } from '../types';
import { SyncStatusModal } from './SyncStatusModal';
import { tauriBridge } from '../services/tauriBridge';

interface SettingsPageProps {
  settings: AppSettings;
  fileCount: number;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onAddWatchedDirectory: (dir: string) => void;
  onRemoveWatchedDirectory: (dir: string) => void;
  onOpenQuickStartWizard: () => void;
  onOptimizeDatabase: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  fileCount,
  onUpdateSettings,
  onAddWatchedDirectory,
  onRemoveWatchedDirectory,
  onOpenQuickStartWizard,
  onOptimizeDatabase,
}) => {
  const [newDirPath, setNewDirPath] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddDirectory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDirPath.trim()) return;

    if (settings.watchedDirectories.some(d => d.toLowerCase() === newDirPath.trim().toLowerCase())) {
      showToast('该目录已在监控列表中');
      return;
    }

    onAddWatchedDirectory(newDirPath.trim());
    setNewDirPath('');
    showToast('已添加新监控目录并触发索引扫描 ✅');
  };

  return (
    <div id="settings-page" className="p-6 space-y-4 max-w-4xl mx-auto h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              应用设置
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              个性化偏好、索引引擎配置与本地存储管理
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* 1. Appearance / Theme */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
            <Sliders className="w-4 h-4 text-[#0078d4]" />
            <span>外观与主题模式</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onUpdateSettings({ theme: 'light' })}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                settings.theme === 'light'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30 text-[#0078d4]'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>浅色 (Light)</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ theme: 'dark' })}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                settings.theme === 'dark'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30 text-[#0078d4]'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>深色 (Dark)</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ theme: 'system' })}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                settings.theme === 'system'
                  ? 'border-[#0078d4] bg-blue-50/50 dark:bg-blue-950/30 text-[#0078d4]'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <Laptop className="w-4 h-4" />
              <span>跟随系统 (System)</span>
            </button>
          </div>
        </div>

        {/* 2. AI Smart Search Toggle */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-500 mt-0.5">
                <Sparkles className="w-4 h-4 fill-amber-400 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                  智能语义理解搜索 (Natural Language Query)
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 max-w-lg leading-relaxed">
                  开启后可在搜索框中直接输入自然语言，例如：“上周的图片”、“昨天的文档”、“财务.xlsx”，系统将自动解析时间范围与分类实体。
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="ai-mode-toggle"
                checked={settings.isAiModeEnabled}
                onChange={(e) => onUpdateSettings({ isAiModeEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0078d4]"></div>
            </label>
          </div>
        </div>

        {/* 3. Watched Directories Management */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              <Folder className="w-4 h-4 text-[#0078d4]" />
              <span>监控目录管理 ({settings.watchedDirectories.length})</span>
            </div>

            <button
              id="settings-wizard-btn"
              onClick={onOpenQuickStartWizard}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-[#0078d4] dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>快速向导</span>
            </button>
          </div>

          <div className="space-y-1.5">
            {settings.watchedDirectories.map((dir, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate">{dir}</span>
                </div>
                <button
                  onClick={() => onRemoveWatchedDirectory(dir)}
                  className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                  title="移除监控目录"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add directory form */}
          <form onSubmit={handleAddDirectory} className="flex gap-2 pt-1">
            <input
              type="text"
              id="new-dir-input"
              value={newDirPath}
              onChange={(e) => setNewDirPath(e.target.value)}
              placeholder="输入要监控的绝对目录路径（例如：D:\Projects）..."
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-neutral-50 dark:bg-[#202020] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#0078d4]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0078d4] hover:bg-[#006cbd] text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加</span>
            </button>
          </form>

          {/* Directory monitoring flags */}
          <div className="pt-2 flex flex-col gap-2 border-t border-black/5 dark:border-white/5">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={settings.autoMonitor}
                onChange={(e) => onUpdateSettings({ autoMonitor: e.target.checked })}
                className="rounded border-neutral-400 text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span>启用 FileSystemWatcher 实时监测文件变更并自动更新索引</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={settings.includeSubdirectories}
                onChange={(e) => onUpdateSettings({ includeSubdirectories: e.target.checked })}
                className="rounded border-neutral-400 text-[#0078d4] focus:ring-[#0078d4]"
              />
              <span>默认递归包含监控目录下的所有子文件夹</span>
            </label>
          </div>
        </div>

        {/* 4. NTFS USN Journal & Real-time Incremental Sync */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span>NTFS USN Change Journal 极速增量同步机制</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              Everything 级秒级对齐
            </span>
          </div>

          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            软件打开期间通过 Windows 变更通知高效更新；软件关闭期间利用 NTFS 驱动内置的 USN 日志记录变化。重新启动时仅需几毫秒读取差异，<strong>永不驻留后台守护进程，零内存开销，严格只读无写入</strong>。
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>纯只读免常驻架构</span>
            </div>

            <button
              id="settings-open-usn-modal-btn"
              onClick={() => setIsSyncModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>查看 USN 卷状态与手动对齐</span>
            </button>
          </div>
        </div>

        {/* 5. Local Database & Engine Maintenance */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
            <Database className="w-4 h-4 text-[#0078d4]" />
            <span>数据存储与 100% 便携免安装架构 (Permanent Portable Mode)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 space-y-1">
              <span className="text-neutral-500 dark:text-neutral-400">已索引总记录数</span>
              <p className="text-base font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                {fileCount} 个文件
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                SQLite FTS5 毫秒级分词引擎
              </p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 space-y-1">
              <span className="text-neutral-500 dark:text-neutral-400">存储架构</span>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>永久纯绿色便携模式（零系统污染）</span>
              </p>
              <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate">
                ./data/myfinder.db (保存在解压文件夹内)
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#202020] border border-black/5 dark:border-white/5 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <div className="font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>彻底卸载说明：</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              MyFinder 不向 Windows 注册表写入任何项目，不占用 C:\Users\AppData。当您不再需要本软件时，只需直接删除解压出来的软件文件夹，电脑即可恢复到使用前的初始状态，如从未运行过一样干净！
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
            <div className="text-[11px] text-neutral-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>每次点击/打开文件时自动秒级核验物理状态，无任何滞后</span>
            </div>

            <button
              id="optimize-db-btn"
              disabled={isOptimizing}
              onClick={async () => {
                setIsOptimizing(true);
                await onOptimizeDatabase();
                setIsOptimizing(false);
                showToast('数据库碎片整理 (VACUUM) 及索引优化完成 ✅');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-[#333] hover:bg-neutral-200 dark:hover:bg-[#444] text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span>{isOptimizing ? '整理中...' : '优化索引与清理碎片'}</span>
            </button>
          </div>
        </div>

        {/* 5. System Integration & Behavior */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
            <HardDrive className="w-4 h-4 text-[#0078d4]" />
            <span>系统集成与行为</span>
          </div>

          <div className="space-y-2 text-xs text-neutral-700 dark:text-neutral-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStart}
                onChange={(e) => onUpdateSettings({ autoStart: e.target.checked })}
                className="rounded border-neutral-400 text-[#0078d4]"
              />
              <span>开机自动启动并在后台驻留索引</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.minimizeToTray}
                onChange={(e) => onUpdateSettings({ minimizeToTray: e.target.checked })}
                className="rounded border-neutral-400 text-[#0078d4]"
              />
              <span>点击关闭按钮时最小化到系统通知托盘，而非退出</span>
            </label>
          </div>
        </div>

        {/* 6. About App */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#2b2b2b] border border-black/5 dark:border-white/5 shadow-xs text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">MyFinder 2.0</span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">版本 v2.0.0 (Fluent Web Edition)</span>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 text-[11px] leading-relaxed">
            轻量、安全、纯本地运行的 Windows 11 Fluent Design 文件搜索与已安装软件管理系统。所有索引数据均保存在本地，不上传任何隐私。
          </p>
        </div>
      </div>

      {/* Toast message */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-neutral-900/90 dark:bg-white/90 text-white dark:text-neutral-900 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}

      {/* Sync Status & USN Journal Modal */}
      <SyncStatusModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncCompleted={() => {
          showToast('NTFS USN 增量同步完成 ✅');
        }}
      />
    </div>
  );
};
