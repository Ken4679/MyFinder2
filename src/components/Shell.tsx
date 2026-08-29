import React from 'react';
import {
  Search,
  FolderTree,
  Clock,
  Package,
  Star,
  Settings,
  Minus,
  Square,
  X,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { NavTab, ElementThemeMode } from '../types';

interface ShellProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  theme: ElementThemeMode;
  onToggleTheme: () => void;
  fileCount: number;
  softwareCount: number;
  favoritesCount: number;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  currentTab,
  onTabChange,
  theme,
  onToggleTheme,
  fileCount,
  softwareCount,
  favoritesCount,
  children,
}) => {
  const [windowState, setWindowState] = React.useState<'normal' | 'minimized' | 'maximized'>('normal');
  const [trayToast, setTrayToast] = React.useState<string | null>(null);

  const showTrayToast = (msg: string) => {
    setTrayToast(msg);
    setTimeout(() => setTrayToast(null), 3000);
  };

  const navItems = [
    { id: 'home' as NavTab, label: '首页搜索', icon: <Search className="w-4 h-4" /> },
    { id: 'tree' as NavTab, label: '目录树', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'recent' as NavTab, label: '最近文件', icon: <Clock className="w-4 h-4" /> },
    {
      id: 'software' as NavTab,
      label: '我的软件',
      icon: <Package className="w-4 h-4" />,
      badge: softwareCount > 0 ? softwareCount : undefined,
    },
    {
      id: 'favorites' as NavTab,
      label: '我的收藏',
      icon: <Star className="w-4 h-4" />,
      badge: favoritesCount > 0 ? favoritesCount : undefined,
    },
    {
      id: 'encyclopedia' as NavTab,
      label: '小白安全百科',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
    },
    {
      id: 'portable' as NavTab,
      label: '便携与单文件EXE',
      icon: <HardDrive className="w-4 h-4 text-blue-500" />,
    },
  ];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f3f3f3] dark:bg-[#202020] text-[#1c1c1c] dark:text-[#f3f3f3]">
      {/* Windows 11 Fluent App Title Bar */}
      <header className="h-10 flex items-center justify-between px-3 bg-white/70 dark:bg-[#2b2b2b]/70 backdrop-blur-md border-b border-black/5 dark:border-white/5 select-none shrink-0 z-30">
        <div className="flex items-center gap-2">
          {/* Windows Fluent Icon */}
          <div className="w-5 h-5 rounded bg-gradient-to-br from-[#0078d4] to-[#005a9e] flex items-center justify-center text-white shadow-2xs">
            <Search className="w-3 h-3 stroke-[2.5]" />
          </div>
          <span className="text-xs font-semibold text-[#1c1c1c] dark:text-[#f3f3f3] tracking-tight">
            MyFinder
          </span>
          <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
            v2.0 • Fluent Design
          </span>
        </div>

        {/* Window control buttons */}
        <div className="flex items-center -mr-1">
          <button
            onClick={() => showTrayToast('已最小化到 Windows 任务栏')}
            className="w-10 h-7 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setWindowState(windowState === 'maximized' ? 'normal' : 'maximized');
              showTrayToast(windowState === 'maximized' ? '已还原窗口' : '已最大化窗口');
            }}
            className="w-10 h-7 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="最大化 / 还原"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => showTrayToast('MyFinder 已最小化到系统托盘并在后台运行')}
            className="w-10 h-7 flex items-center justify-center text-neutral-500 hover:text-white dark:text-neutral-400 hover:bg-red-600 dark:hover:bg-red-600 transition-colors cursor-pointer"
            title="关闭 (最小化到托盘)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main App Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fluent Sidebar (NavigationView) */}
        <aside className="w-52 flex flex-col justify-between bg-white/50 dark:bg-[#202020]/50 backdrop-blur-md border-r border-black/5 dark:border-white/5 p-2 shrink-0 select-none">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-black/5 dark:bg-white/10 text-[#0078d4] dark:text-[#60cdff] shadow-2xs font-semibold'
                      : 'text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Active indicator pill */}
                    <div
                      className={`w-0.5 h-3.5 rounded-full transition-all ${
                        isActive ? 'bg-[#0078d4] dark:bg-[#60cdff]' : 'bg-transparent'
                      }`}
                    />
                    <span className={isActive ? 'text-[#0078d4] dark:text-[#60cdff]' : 'text-neutral-400 dark:text-neutral-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom section of Sidebar: Settings & Theme switch */}
          <div className="space-y-1 pt-2 border-t border-black/5 dark:border-white/5">
            <button
              id="nav-settings"
              onClick={() => onTabChange('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                currentTab === 'settings'
                  ? 'bg-black/5 dark:bg-white/10 text-[#0078d4] dark:text-[#60cdff] shadow-2xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-0.5 h-3.5 rounded-full transition-all ${
                  currentTab === 'settings' ? 'bg-[#0078d4] dark:bg-[#60cdff]' : 'bg-transparent'
                }`}
              />
              <Settings className={`w-4 h-4 ${currentTab === 'settings' ? 'text-[#0078d4] dark:text-[#60cdff]' : 'text-neutral-400'}`} />
              <span>应用设置</span>
            </button>

            <button
              id="theme-quick-toggle"
              onClick={onToggleTheme}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="切换主题模式"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                ) : theme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Laptop className="w-3.5 h-3.5 text-neutral-400" />
                )}
                <span className="text-[11px] capitalize">{theme} 主题</span>
              </div>
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-hidden relative flex flex-col bg-[#f9f9f9] dark:bg-[#1b1b1b]">
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>

          {/* Footer Status Bar */}
          <footer className="h-6 px-4 bg-white/40 dark:bg-[#202020]/40 backdrop-blur-xs border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500 select-none shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>实时状态核验中 • 0 滞后同步</span>
              </span>
              <span>•</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">100% 绿色便携 (删除文件夹即彻底清除)</span>
              <span>•</span>
              <span>已收录 {fileCount} 个本地文件</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono">SQLite FTS5 | UTF-8</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <HardDrive className="w-3 h-3" />
                <span>纯本地零残留</span>
              </span>
            </div>
          </footer>
        </main>
      </div>

      {/* Tray Toast Notification */}
      {trayToast && (
        <div
          id="tray-toast"
          className="fixed bottom-8 right-6 z-50 px-4 py-2.5 rounded-lg bg-neutral-900/95 dark:bg-white/95 text-white dark:text-neutral-900 text-xs font-medium shadow-2xl border border-white/10 dark:border-black/10 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span>{trayToast}</span>
        </div>
      )}
    </div>
  );
};
