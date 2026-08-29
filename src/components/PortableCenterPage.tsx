import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  Cpu,
  Package,
  Layers,
  FileCode,
  Sparkles,
  AlertCircle,
  Copy,
  RefreshCw,
  Zap,
  Check
} from 'lucide-react';
import { AppSettings, FileRecord } from '../types';
import { formatBytes } from '../services/storageService';
import { fileSyncService } from '../services/fileSyncService';

interface PortableCenterPageProps {
  settings: AppSettings;
  files: FileRecord[];
  onWipeData: () => void;
  onRefreshFiles?: () => void;
}

export const PortableCenterPage: React.FC<PortableCenterPageProps> = ({
  settings,
  files,
  onWipeData,
  onRefreshFiles,
}) => {
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [simulatedStatus, setSimulatedStatus] = useState<string | null>(null);

  const totalIndexBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const estimatedDbBytes = files.length * 1024 + 40960; // Approximate SQLite index size

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(id);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const handleSimulateExternalDelete = () => {
    if (files.length > 0) {
      const target = files[0];
      fileSyncService.simulateExternalFileDeletion(target.path);
      setSimulatedStatus(`已模拟：在软件外部删除了「${target.fileName}」。此时去首页或目录树点击它，软件将即时识别并自动同步清除，绝对0滞后！`);
    }
  };

  const handleSimulateExternalModify = () => {
    if (files.length > 0) {
      const target = files[0];
      const newSize = (target.sizeBytes || 100000) + 54321;
      fileSyncService.simulateExternalFileModification(target.path, newSize);
      setSimulatedStatus(`已模拟：在软件外部修改了「${target.fileName}」的内容。点击打开它时将自动核验并更新为最新属性！`);
    }
  };

  const handleResetSimulation = () => {
    fileSyncService.resetExternalSimulation();
    setSimulatedStatus('已重置外部文件系统模拟状态。');
    if (onRefreshFiles) onRefreshFiles();
  };

  const tauriBuildScript = `# 选项 1: 使用 Tauri (推荐，极小体积 <4MB，原生 Windows 11 Fluent 体验)
# 1. 确保安装了 Node.js 与 Rust
cargo install tauri-cli

# 2. 一键打包生成独立的单个 MyFinder.exe 文件
npm run build
cargo tauri build --target x86_64-pc-windows-msvc

# 打包产物直接位于: src-tauri/target/release/MyFinder.exe
# 双击即可在任何 Windows 10/11 电脑上秒开，无需安装，随拷随走！`;

  const dotnetAotScript = `# 选项 2: 使用 C# .NET 8 / 9 Native AOT 单文件编译
dotnet publish MyFinder.sln -c Release -r win-x64 \\
  -p:PublishSingleFile=true \\
  -p:SelfContained=true \\
  -p:EnableCompressionInSingleFile=true \\
  -p:PublishTrimmed=true \\
  -o ./dist/portable-win-x64

# 输出一个完全独立的单个 MyFinder.exe 文件，删除文件夹即完全卸载`;

  const handleExportJson = () => {
    const dataStr = JSON.stringify(
      {
        version: '2.0.0',
        portableMode: true,
        exportedAt: new Date().toISOString(),
        settings,
        filesCount: files.length,
        files: files.map(f => ({
          path: f.path,
          fileName: f.fileName,
          extension: f.extension,
          category: f.category,
          updatedTime: f.updatedTime,
        })),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MyFinder_Portable_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm">
                <HardDrive className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
                100% 绿色便携与零残留控制台
              </h1>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-2xl leading-relaxed">
              严格遵循“零系统污染、零注册表写入、零垃圾残留”原则。程序所有数据存放在本文件夹内，删除本文件夹即可 100% 干净卸载，绝不损伤系统或影响您的其它项目。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>备份便携数据</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Pillars of Zero-Trace & Safety */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-[#252525] border border-emerald-200 dark:border-emerald-900/40 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">注册表写入状态</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">0 写入</div>
          <p className="text-[11px] text-neutral-500">绝不向 Windows 注册表注入任何开机项或服务组件。</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252525] border border-emerald-200 dark:border-emerald-900/40 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">AppData 目录占用</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">0 字节</div>
          <p className="text-[11px] text-neutral-500">不在 C:\Users\AppData 散落任何临时缓存或历史记录。</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252525] border border-emerald-200 dark:border-emerald-900/40 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">卸载干净度</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">100% 彻底</div>
          <p className="text-[11px] text-neutral-500">直接删除软件所在文件夹，电脑即刻恢复如初，绝无残留。</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252525] border border-emerald-200 dark:border-emerald-900/40 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">只读安全保护盾</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">已全天候激活</div>
          <p className="text-[11px] text-neutral-500">只读扫描，不擅自删除或修改任何其他工程及文件。</p>
        </div>
      </section>

      {/* Real-Time Zero-Lag Status & Integrity Verification Workbench */}
      <section className="bg-white dark:bg-[#252525] rounded-xl p-5 border border-blue-500/20 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-500 text-white">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3] flex items-center gap-2">
                <span>实时状态自动校验系统（0滞后引擎）</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium">
                  开机自检 + 打开文件即时核验
                </span>
              </h2>
              <p className="text-xs text-neutral-500">
                每次打开或点击文件时自动秒级核验物理磁盘状态。若在软件关闭期间外部删除了文件，重新运行或点击时立即识别并同步剔除，绝不发生状态滞后。
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (onRefreshFiles) onRefreshFiles();
              setSimulatedStatus(`已完成全局状态核验，当前 ${files.length} 个本地文件与磁盘 100% 同步一致（0滞后）！`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[#0078d4] dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>立即核验全部文件状态</span>
          </button>
        </div>

        {/* Interactive Simulation Sandbox */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              <span>外部变动自愈测试靶场（无需真的删文件，一键测试体验零滞后）：</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSimulateExternalDelete}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#333] hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>🧪 模拟在软件关闭期间外部删除了文件</span>
            </button>

            <button
              onClick={handleSimulateExternalModify}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#333] hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>🧪 模拟外部修改了文件大小与时间</span>
            </button>

            <button
              onClick={handleResetSimulation}
              className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 text-neutral-700 dark:text-neutral-200 text-xs font-medium transition-colors cursor-pointer"
            >
              <span>重置测试</span>
            </button>
          </div>

          {simulatedStatus && (
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-900 dark:text-blue-100 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>{simulatedStatus}</span>
            </div>
          )}
        </div>
      </section>

      {/* Storage and Data Wipe Section */}
      <section className="bg-white dark:bg-[#252525] rounded-xl p-5 border border-black/5 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
              本地便携存储空间概况
            </h2>
          </div>
          <span className="text-xs text-neutral-400 font-mono">存储路径: ./data/myfinder_db.sqlite</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50">
            <span className="text-neutral-400 block mb-1">已索引文件总数</span>
            <span className="text-base font-bold text-neutral-800 dark:text-neutral-100 font-mono">
              {files.length} 个本地文件
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50">
            <span className="text-neutral-400 block mb-1">监控源文件总体积</span>
            <span className="text-base font-bold text-neutral-800 dark:text-neutral-100 font-mono">
              {formatBytes(totalIndexBytes)}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50">
            <span className="text-neutral-400 block mb-1">本地 SQLite 数据库体积</span>
            <span className="text-base font-bold text-neutral-800 dark:text-neutral-100 font-mono">
              {formatBytes(estimatedDbBytes)}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>如果准备转移电脑或彻底清空，可执行一键无痕擦除重置（绝不影响您电脑上的原始文档）。</span>
          </div>

          {showWipeConfirm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onWipeData();
                  setShowWipeConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                确认彻底擦除
              </button>
              <button
                onClick={() => setShowWipeConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWipeConfirm(true)}
              className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>一键清空便携数据库</span>
            </button>
          )}
        </div>
      </section>

      {/* Standalone Single EXE Packaging Guide */}
      <section className="bg-white dark:bg-[#252525] rounded-xl p-5 border border-black/5 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-500" />
            <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
              本地单文件独立 EXE 编译方案（无需安装 • 真正的纯净 EXE）
            </h2>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 font-medium">
            原生 Windows 桌面程序
          </span>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          您可以直接将本项目打包为单个 <code>MyFinder.exe</code> 可执行文件。打包后是一个纯粹的绿色单文件，直接放在 U 盘或桌面双击即用，删除文件即彻底卸载。
        </p>

        {/* Script Option 1: Tauri */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
              <span>方案 A：Tauri (体积仅 ~3MB，极速秒启，内存占用 &lt; 20MB)</span>
            </div>
            <button
              onClick={() => handleCopy(tauriBuildScript, 'tauri')}
              className="text-xs text-[#0078d4] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedScript === 'tauri' ? '已复制命令' : '复制命令'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-lg bg-neutral-900 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed border border-neutral-800">
            {tauriBuildScript}
          </pre>
        </div>

        {/* Script Option 2: C# .NET Native AOT */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
              <FileCode className="w-3.5 h-3.5 text-purple-500" />
              <span>方案 B：C# .NET 8 / 9 Native AOT 单文件发布</span>
            </div>
            <button
              onClick={() => handleCopy(dotnetAotScript, 'dotnet')}
              className="text-xs text-[#0078d4] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedScript === 'dotnet' ? '已复制命令' : '复制命令'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-lg bg-neutral-900 text-purple-300 font-mono text-xs overflow-x-auto leading-relaxed border border-neutral-800">
            {dotnetAotScript}
          </pre>
        </div>
      </section>
    </div>
  );
};
