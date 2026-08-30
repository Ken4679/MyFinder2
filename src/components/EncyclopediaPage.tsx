import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  HelpCircle,
  CheckCircle2,
  XCircle,
  FileQuestion,
  FileText,
  Sparkles,
  Info,
  FolderLock,
  HardDrive
} from 'lucide-react';
import { FILE_SAFETY_DATABASE, getFileSafetyInfo, isSystemCriticalPath } from '../services/fileSafetyService';
import { FileSafetyLevel } from '../types';

export const EncyclopediaPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | FileSafetyLevel>('all');
  const [diagnoseInput, setDiagnoseInput] = useState('C:\\Windows\\System32\\ntfs.sys');

  // Diagnostic result for the user's custom input
  const diagnoseResult = useMemo(() => {
    if (!diagnoseInput.trim()) return null;
    const clean = diagnoseInput.trim();
    const parts = clean.split('\\');
    const fileName = parts.pop() || clean;
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';
    const safety = getFileSafetyInfo(ext, clean);
    const isCriticalPath = isSystemCriticalPath(clean);
    return {
      fileName,
      path: clean,
      ext,
      safety,
      isCriticalPath
    };
  }, [diagnoseInput]);

  const allEntries = useMemo(() => {
    return Object.entries(FILE_SAFETY_DATABASE).map(([ext, info]) => ({
      ext,
      ...info,
    }));
  }, []);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(item => {
      const matchFilter = selectedFilter === 'all' || item.level === selectedFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.ext.toLowerCase().includes(q) ||
        item.typeName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [allEntries, selectedFilter, searchQuery]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 backdrop-blur-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500 text-white shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
                新手小白电脑文件安全百科与保护指南
              </h1>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-2xl leading-relaxed">
              不知道某些文件是干什么的？害怕误删导致电脑损坏开不了机？在这里输入任何文件后缀或路径，即可得到通俗易懂的“人话解释”与安全防踩坑建议。
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-2 rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-black/5 dark:border-white/10 text-xs shadow-2xs">
              <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>MyFinder 绝对安全承诺</span>
              </div>
              <p className="text-neutral-500 text-[11px] mt-0.5">只读扫描引擎 • 绝不擅自删除修改任何项目</p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Safety Diagnostic Tool */}
      <section className="bg-white dark:bg-[#252525] rounded-xl p-5 border border-black/5 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
              小白文件安全自检仪（粘贴路径或文件名诊断）
            </h2>
          </div>
          <span className="text-xs text-neutral-400">实时评估删除风险与安全性</span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={diagnoseInput}
              onChange={(e) => setDiagnoseInput(e.target.value)}
              placeholder="例如: C:\Windows\System32\kernel32.dll 或 工作总结.docx 或 app.log"
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setDiagnoseInput('D:\\Documents\\2025规划.docx')}
              className="px-2.5 py-1.5 text-xs rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
            >
              测 Word 文档
            </button>
            <button
              onClick={() => setDiagnoseInput('C:\\Windows\\System32\\ntfs.sys')}
              className="px-2.5 py-1.5 text-xs rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
            >
              测 系统核心驱动
            </button>
          </div>
        </div>

        {diagnoseResult && (
          <div
            className={`p-4 rounded-xl border transition-all ${
              diagnoseResult.safety.level === 'danger'
                ? 'bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100'
                : diagnoseResult.safety.level === 'caution'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2">
                {diagnoseResult.safety.level === 'danger' ? (
                  <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                ) : diagnoseResult.safety.level === 'caution' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <div>
                  <span className="text-sm font-bold">{diagnoseResult.safety.typeName}</span>
                  <span className="text-xs ml-2 opacity-80 font-mono">({diagnoseResult.ext || '无后缀'})</span>
                </div>
              </div>

              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto ${
                  diagnoseResult.safety.level === 'danger'
                    ? 'bg-red-500 text-white'
                    : diagnoseResult.safety.level === 'caution'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {diagnoseResult.safety.levelBadge}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-xs leading-relaxed">
              <div>
                <span className="font-semibold block mb-1 opacity-70">💡 这是什么？</span>
                <p>{diagnoseResult.safety.description}</p>
              </div>

              <div>
                <span className="font-semibold block mb-1 opacity-70">⚠️ 能不能删？会坏电脑吗？</span>
                <p>{diagnoseResult.safety.deletionSafety}</p>
              </div>

              <div>
                <span className="font-semibold block mb-1 opacity-70">🛠️ 推荐安全打开方式</span>
                <p>{diagnoseResult.safety.openRecommendation}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5 Golden Rules for Novice Users */}
      <section className="bg-white dark:bg-[#252525] rounded-xl p-5 border border-black/5 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
            小白防搞坏电脑：5 大核心安全常识
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-red-600 dark:text-red-400">
              <FolderLock className="w-4 h-4" />
              <span>1. 禁区：C:\Windows 绝对不删</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              C 盘 Windows 文件夹是系统的“心脏”，里面的任何文件即使看着像垃圾也绝对不要手动清理。
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
              <FileText className="w-4 h-4" />
              <span>2. 放心：文档与照片随意删</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              .docx, .xlsx, .jpg, .png, .mp4 这些是您自己的私人资料，删除只会减少占用，绝不可能损坏电脑硬件或系统。
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
              <HardDrive className="w-4 h-4" />
              <span>3. 绿色便携：删目录即完全卸载</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              MyFinder 采用 100% 绿色便携架构，不写注册表、不留后台残渣。直接删除 MyFinder 文件夹就 100% 干净卸载。
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>4. 零破坏：只读搜索引擎</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              MyFinder 只负责阅读并加速您的搜索，绝不会后台偷偷删除、重命名或篡改您正在做的工作或任何代码工程。
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span>5. 提防：陌生来源的 .exe / .bat</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              QQ 或微信群里陌生人发来的压缩包若包含 .exe 或 .bat，不要直接双击运行，先确认发送者身份。
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/50 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-cyan-600 dark:text-cyan-400">
              <HelpCircle className="w-4 h-4" />
              <span>6. 随时查：看准安全红绿灯</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              在 MyFinder 中看到文件列表上的 🟢 🟡 🔴 标签，绿灯代表安全可动，黄灯谨慎，红灯严禁乱动。
            </p>
          </div>
        </div>
      </section>

      {/* Encyclopedia List Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileQuestion className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-[#1c1c1c] dark:text-[#f3f3f3]">
              常见文件类型速查表 ({filteredEntries.length} 类)
            </h2>
          </div>

          {/* Filter tabs & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setSelectedFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedFilter === 'all'
                    ? 'bg-white dark:bg-neutral-700 font-bold shadow-2xs text-[#0078d4]'
                    : 'text-neutral-500'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setSelectedFilter('safe')}
                className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  selectedFilter === 'safe'
                    ? 'bg-white dark:bg-neutral-700 font-bold shadow-2xs text-emerald-600'
                    : 'text-neutral-500'
                }`}
              >
                <span>🟢 放心动</span>
              </button>
              <button
                onClick={() => setSelectedFilter('caution')}
                className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  selectedFilter === 'caution'
                    ? 'bg-white dark:bg-neutral-700 font-bold shadow-2xs text-amber-600'
                    : 'text-neutral-500'
                }`}
              >
                <span>🟡 需谨慎</span>
              </button>
              <button
                onClick={() => setSelectedFilter('danger')}
                className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  selectedFilter === 'danger'
                    ? 'bg-white dark:bg-neutral-700 font-bold shadow-2xs text-red-600'
                    : 'text-neutral-500'
                }`}
              >
                <span>🔴 严禁删</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索后缀 (如 dll, docx)..."
                className="pl-8 pr-3 py-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              />
            </div>
          </div>
        </div>

        {/* Entries Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredEntries.map((item) => (
            <div
              key={item.ext}
              className={`p-4 rounded-xl border transition-all hover:shadow-sm bg-white dark:bg-[#252525] ${
                item.level === 'danger'
                  ? 'border-red-200 dark:border-red-900/40 hover:border-red-400'
                  : item.level === 'caution'
                  ? 'border-amber-200 dark:border-amber-900/40 hover:border-amber-400'
                  : 'border-emerald-200 dark:border-emerald-900/40 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-neutral-100 dark:bg-neutral-800 text-[#0078d4] dark:text-[#60cdff]">
                    {item.ext}
                  </span>
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    {item.typeName}
                  </span>
                </div>

                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    item.level === 'danger'
                      ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                      : item.level === 'caution'
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {item.levelBadge}
                </span>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3 leading-relaxed">
                {item.description}
              </p>

              <div className="space-y-1.5 text-[11px] pt-2.5 border-t border-black/5 dark:border-white/5">
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">是否可删:</span>
                  <span className="text-neutral-600 dark:text-neutral-400">{item.deletionSafety}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">打开方式:</span>
                  <span className="text-neutral-600 dark:text-neutral-400">{item.openRecommendation}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
