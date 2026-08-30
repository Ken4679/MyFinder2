import React, { useState, useEffect } from 'react';
import {
  Package,
  Shield,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Copy,
  Check,
  X,
  Play,
  Search,
  Trash2,
  FileCode,
  HardDrive,
  Building,
  Info,
  Clock,
  Eye,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  SoftwareRecord,
  LeftoverCandidate,
  UninstallPrecheckInfo,
  CleanupExecutionReport,
  CleanupPlan,
} from '../types';
import { tauriBridge } from '../services/tauriBridge';
import { formatBytes } from '../services/storageService';

interface UninstallWizardModalProps {
  software: SoftwareRecord;
  onClose: () => void;
  onFinishedAndRefresh: () => Promise<void>;
}

type WizardStep = 'precheck' | 'running' | 'detecting' | 'review' | 'report';

export const UninstallWizardModal: React.FC<UninstallWizardModalProps> = ({
  software,
  onClose,
  onFinishedAndRefresh,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('precheck');
  const [precheckInfo, setPrecheckInfo] = useState<UninstallPrecheckInfo | null>(null);
  const [isPrechecking, setIsPrechecking] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<LeftoverCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);

  const [isDryRun, setIsDryRun] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupExecutionReport | null>(null);

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

  // 1. Initial precheck
  useEffect(() => {
    setIsPrechecking(true);
    tauriBridge
      .precheckSoftwareUninstall(software)
      .then((info) => {
        setPrecheckInfo(info);
        setIsPrechecking(false);
      })
      .catch((err) => {
        console.error('Precheck failed', err);
        setIsPrechecking(false);
      });
  }, [software]);

  // 2. Launch Official Uninstaller
  const handleLaunchUninstaller = async () => {
    setIsLaunching(true);
    try {
      const res = await tauriBridge.launchSoftwareUninstaller(software);
      setLaunchMessage(res.message);
      setCurrentStep('running');
    } catch (err: any) {
      showToast(err.toString());
    } finally {
      setIsLaunching(false);
    }
  };

  // 3. Scan Leftovers
  const handleScanLeftovers = async () => {
    setCurrentStep('detecting');
    setIsDetecting(true);
    try {
      const detected = await tauriBridge.detectSoftwareLeftovers(software);
      setCandidates(detected);
      // Auto-select ONLY high-confidence and non-protected items
      const defaultSelected = new Set<string>();
      detected.forEach((c) => {
        if (c.recommendedSelected && !c.isProtected && c.confidence === 'high') {
          defaultSelected.add(c.id);
        }
      });
      setSelectedIds(defaultSelected);
      setCurrentStep('review');
    } catch (err: any) {
      showToast(`残留检测失败: ${err}`);
      setCurrentStep('review');
    } finally {
      setIsDetecting(false);
    }
  };

  // 4. Toggle Candidate Selection
  const toggleCandidate = (id: string, candidate: LeftoverCandidate) => {
    if (candidate.isProtected) return; // Protected items cannot be selected
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // 5. Execute Cleanup / Dry Run
  const handleExecuteCleanup = async () => {
    const chosenItems = candidates.filter((c) => selectedIds.has(c.id));
    if (chosenItems.length === 0 && !isDryRun) {
      showToast('未选择任何清理项目');
      return;
    }

    setIsExecuting(true);
    const plan: CleanupPlan = {
      softwareId: software.id,
      softwareName: software.displayName,
      items: chosenItems,
      isDryRun: isDryRun,
    };

    try {
      const report = await tauriBridge.executeSoftwareCleanup(plan);
      setCleanupReport(report);
      setCurrentStep('report');
    } catch (err: any) {
      showToast(`清理执行失败: ${err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#252525] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-neutral-50/50 dark:bg-[#202020]/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] dark:text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                  安全卸载向导与残留检测
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100/70 dark:bg-blue-900/40 text-[#0078d4] dark:text-blue-300">
                  安全向导
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {software.displayName} • 官方卸载先行与逐项审查机制
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

        {/* Wizard Stepper Bar */}
        <div className="grid grid-cols-4 border-b border-black/5 dark:border-white/5 bg-neutral-100/40 dark:bg-[#1f1f1f]/40 text-xs">
          <div
            className={`px-3 py-2 text-center font-medium border-b-2 transition-colors ${
              currentStep === 'precheck'
                ? 'border-[#0078d4] text-[#0078d4] bg-white dark:bg-[#252525]'
                : 'border-transparent text-neutral-400'
            }`}
          >
            1. 安全检查
          </div>
          <div
            className={`px-3 py-2 text-center font-medium border-b-2 transition-colors ${
              currentStep === 'running'
                ? 'border-[#0078d4] text-[#0078d4] bg-white dark:bg-[#252525]'
                : 'border-transparent text-neutral-400'
            }`}
          >
            2. 官方卸载
          </div>
          <div
            className={`px-3 py-2 text-center font-medium border-b-2 transition-colors ${
              currentStep === 'detecting' || currentStep === 'review'
                ? 'border-[#0078d4] text-[#0078d4] bg-white dark:bg-[#252525]'
                : 'border-transparent text-neutral-400'
            }`}
          >
            3. 残留审查
          </div>
          <div
            className={`px-3 py-2 text-center font-medium border-b-2 transition-colors ${
              currentStep === 'report'
                ? 'border-[#0078d4] text-[#0078d4] bg-white dark:bg-[#252525]'
                : 'border-transparent text-neutral-400'
            }`}
          >
            4. 执行报告
          </div>
        </div>

        {/* Step Contents */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
          {/* STEP 1: Precheck */}
          {currentStep === 'precheck' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-300 space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Shield className="w-4 h-4 text-[#0078d4]" />
                  <span>第一准则：优先拉起软件官方卸载程序</span>
                </div>
                <p className="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
                  MyFinder 不会直接暴力删除应用目录。我们将首先调起该软件在 Windows
                  注册表登记的官方卸载向导，由官方程序执行常规反注册与文件移除。
                </p>
              </div>

              {isPrechecking ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0078d4]" />
                  <span>正在校验卸载程序与安全签名...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                      <span className="text-neutral-400">应用名称</span>
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {software.displayName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                      <span className="text-neutral-400">发布商</span>
                      <span className="text-neutral-700 dark:text-neutral-300">
                        {software.publisher || '未登记发布商'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                      <span className="text-neutral-400">版本</span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        v{software.version || '未知'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                      <span className="text-neutral-400">安装位置</span>
                      <span
                        className="font-mono text-neutral-700 dark:text-neutral-300 max-w-xs truncate"
                        title={software.installLocation || ''}
                      >
                        {software.installLocation || '未提供具体路径'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">卸载程序类型</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                          {precheckInfo?.uninstallerType.toUpperCase() || 'EXE'}
                        </span>
                        {precheckInfo?.uninstallerExists ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 存在且有效
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" /> 卸载文件缺失
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {precheckInfo?.isRunning && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300 flex items-start gap-2 text-[11px]">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">检测到该软件的主进程正在运行：</span>
                        <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">
                          为了防止卸载过程发生文件被占用锁定，建议在启动卸载前先退出该应用。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Running */}
          {currentStep === 'running' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0078d4] animate-pulse">
                <Package className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-semibold text-[#1c1c1c] dark:text-[#f3f3f3]">
                  官方卸载向导已调起
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {launchMessage || '请在 Windows 弹出的卸载向导窗口中完成常规卸载流程。'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 max-w-md text-left text-[11px] text-neutral-500 dark:text-neutral-400">
                <p className="font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                  💡 下一步操作指引：
                </p>
                <p>1. 按照官方向导指引完成卸载。</p>
                <p>2. 当官方卸载程序关闭后，点击下方「开始扫描残留」按钮。</p>
                <p>3. MyFinder 将深度分析安装目录、配置缓存、注册表及快捷方式残留。</p>
              </div>
            </div>
          )}

          {/* STEP 3: Detecting Leftovers */}
          {currentStep === 'detecting' && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#0078d4]" />
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  正在扫描残留痕迹...
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  正在检查安装目录、%APPDATA%、%LOCALAPPDATA%、开始菜单与注册表
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Review Leftovers */}
          {currentStep === 'review' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
                    检测到 {candidates.length} 项疑似残留
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    已默认勾选高置信度项，系统保护项不可选，低置信度项需手动核实
                  </p>
                </div>

                {/* Dry Run Toggle */}
                <div className="flex items-center gap-2 bg-neutral-100 dark:bg-[#1f1f1f] p-1 rounded-xl border border-black/5 dark:border-white/5 text-[11px]">
                  <button
                    onClick={() => setIsDryRun(true)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      isDryRun
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    试运行 (Dry Run)
                  </button>
                  <button
                    onClick={() => setIsDryRun(false)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      !isDryRun
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    安全清理
                  </button>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className="py-10 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 stroke-[1.5] mb-2" />
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    未发现显著残留项
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    官方卸载程序已较为完整地移除了相关文件与登记项。
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {candidates.map((cand) => {
                    const isChecked = selectedIds.has(cand.id);
                    return (
                      <div
                        key={cand.id}
                        onClick={() => toggleCandidate(cand.id, cand)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          cand.isProtected
                            ? 'bg-neutral-100/60 dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 opacity-60 cursor-not-allowed'
                            : isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/20 border-[#0078d4]/40 shadow-2xs'
                            : 'bg-neutral-50 dark:bg-[#1f1f1f] border-black/5 dark:border-white/5 hover:border-black/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            disabled={cand.isProtected}
                            checked={isChecked}
                            onChange={() => {}} // handled by div
                            className="mt-1 rounded text-[#0078d4] focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                          />

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200 break-all">
                                {cand.path}
                              </span>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {cand.sizeBytes != null && (
                                  <span className="font-mono text-[10px] text-neutral-400">
                                    {formatBytes(cand.sizeBytes)}
                                  </span>
                                )}

                                {/* Confidence badge */}
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
                                    ? '高置信度'
                                    : cand.confidence === 'medium'
                                    ? '中置信度'
                                    : '低置信度'}
                                </span>

                                {/* Risk badge */}
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    cand.risk === 'protected'
                                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                      : cand.risk === 'safeToReview'
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                  }`}
                                >
                                  {cand.risk === 'protected'
                                    ? '系统保护'
                                    : cand.risk === 'safeToReview'
                                    ? '可安全审查'
                                    : '需人工核对'}
                                </span>
                              </div>
                            </div>

                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              🔍 证据：{cand.reason}
                            </p>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(cand.path, cand.id);
                                }}
                                className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-[#0078d4] cursor-pointer"
                              >
                                {copiedId === cand.id ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>复制路径</span>
                              </button>

                              {cand.itemType !== 'registryKey' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    tauriBridge.revealInExplorerNative(cand.path);
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-amber-500 cursor-pointer"
                                >
                                  <FolderOpen className="w-3 h-3 text-amber-500" />
                                  <span>定位文件</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Execution Report */}
          {currentStep === 'report' && cleanupReport && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  cleanupReport.isDryRun
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                }`}
              >
                <div>
                  <h3 className="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
                    {cleanupReport.isDryRun ? '🔍 试运行安全评估完成' : '✅ 残留清理执行完毕'}
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    已审计 {cleanupReport.totalCandidates} 个项目 •{' '}
                    {cleanupReport.isDryRun ? '已验证安全权限' : `成功清理 ${cleanupReport.removedCount} 项`} •{' '}
                    跳过 {cleanupReport.skippedCount} 项 • 失败 {cleanupReport.failedCount} 项
                  </p>
                </div>
                <span className="font-mono text-[11px] text-neutral-400">
                  {cleanupReport.timestamp}
                </span>
              </div>

              {/* Item-by-item detail */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {cleanupReport.results.map((res, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200 truncate">
                        {res.path}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          res.status === 'removed'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : res.status === 'dry_run_simulated'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                            : res.status === 'skipped_in_use'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {res.status === 'removed'
                          ? '已安全清理'
                          : res.status === 'dry_run_simulated'
                          ? '试运行通过'
                          : res.status === 'skipped_in_use'
                          ? '文件占用跳过'
                          : res.status === 'skipped_protected'
                          ? '系统保护跳过'
                          : '已跳过'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {res.message}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-neutral-100/70 dark:bg-[#1a1a1a] text-[11px] text-neutral-500 dark:text-neutral-400 space-y-0.5">
                <p className="font-medium text-neutral-700 dark:text-neutral-300">
                  📋 本地安全审计日志已记录
                </p>
                <p>已保存在便携数据目录 `.myfinder/logs/uninstall_audit.jsonl` 中，供管理员随时复核。</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 dark:bg-[#202020] border-t border-black/5 dark:border-white/5 flex items-center justify-between">
          <div>
            {currentStep === 'review' && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                已选中 {selectedIds.size} / {candidates.length} 项
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep === 'precheck' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  id="wizard-launch-uninstaller-btn"
                  disabled={isLaunching || isPrechecking}
                  onClick={handleLaunchUninstaller}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>启动官方卸载程序</span>
                </button>
              </>
            )}

            {currentStep === 'running' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  稍后处理
                </button>
                <button
                  id="wizard-start-scan-leftovers-btn"
                  onClick={handleScanLeftovers}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>我已完成官方卸载，开始扫描残留</span>
                </button>
              </>
            )}

            {currentStep === 'review' && (
              <>
                <button
                  onClick={() => setCurrentStep('precheck')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  返回上一步
                </button>
                <button
                  id="wizard-execute-cleanup-btn"
                  disabled={isExecuting || (selectedIds.size === 0 && !isDryRun)}
                  onClick={handleExecuteCleanup}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50 ${
                    isDryRun
                      ? 'bg-[#0078d4] hover:bg-[#006cbd]'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isDryRun ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>执行试运行评估 ({selectedIds.size} 项)</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>确认清理已选残留 ({selectedIds.size} 项)</span>
                    </>
                  )}
                </button>
              </>
            )}

            {currentStep === 'report' && (
              <button
                id="wizard-finish-refresh-btn"
                onClick={async () => {
                  await onFinishedAndRefresh();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] text-white transition-colors cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>刷新软件清单并完成</span>
              </button>
            )}
          </div>
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
