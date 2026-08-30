import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileCheck,
  FileCode,
  Folder,
  HardDrive,
  Copy,
  Check,
  X,
  RefreshCw,
  Hash,
  Activity,
  UserCheck,
  Building,
  Info,
  Clock,
  Lock,
} from 'lucide-react';
import { HashResult, SecurityAssessment } from '../types';
import { tauriBridge } from '../services/tauriBridge';
import { formatBytes } from '../services/storageService';

interface SecurityAssessmentModalProps {
  targetPath: string;
  targetName?: string;
  onClose: () => void;
}

export const SecurityAssessmentModal: React.FC<SecurityAssessmentModalProps> = ({
  targetPath,
  targetName,
  onClose,
}) => {
  const [assessment, setAssessment] = useState<SecurityAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    showToast(`已复制 ${label} 到剪贴板`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  useEffect(() => {
    setIsLoading(true);
    tauriBridge
      .inspectFileSecurity(targetPath)
      .then((res) => {
        setAssessment(res);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Security inspection failed', err);
        setIsLoading(false);
      });
  }, [targetPath]);

  const handleCalculateHash = async () => {
    setIsHashing(true);
    try {
      const res = await tauriBridge.calculateFileHash(targetPath);
      setHashResult(res);
      showToast('SHA-256 计算完成 (100% 本地运算)');
    } catch (err: any) {
      showToast(`哈希计算失败: ${err}`);
    } finally {
      setIsHashing(false);
    }
  };

  const getTrustBadge = (state?: string) => {
    switch (state) {
      case 'trusted':
        return {
          label: '已验证受信任 (Trusted)',
          bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
        };
      case 'lowRisk':
        return {
          label: '低风险 (Low Risk)',
          bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/70 text-blue-700 dark:text-blue-300',
          icon: <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
        };
      case 'needsReview':
        return {
          label: '需人工复核 (Needs Review)',
          bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70 text-amber-700 dark:text-amber-300',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
        };
      case 'highRisk':
        return {
          label: '高风险关注 (High Risk)',
          bg: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300',
          icon: <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
        };
      case 'protectedSystem':
        return {
          label: '系统核心受保护 (Protected/System)',
          bg: 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800/70 text-purple-700 dark:text-purple-300',
          icon: <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
        };
      default:
        return {
          label: '未充分知悉 (Unknown)',
          bg: 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300',
          icon: <Info className="w-5 h-5 text-neutral-500" />,
        };
    }
  };

  const badge = getTrustBadge(assessment?.trustState);

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
                  本地安全与信任模型评估
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100/70 dark:bg-blue-900/40 text-[#0078d4] dark:text-blue-300">
                  多维凭据分析
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-md">
                {targetName || targetPath.split(/[/\\]/).pop()}
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

        {/* Content Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
          {/* Antivirus Boundary Notice */}
          <div className="p-3 rounded-xl bg-neutral-100/70 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            <p>
              <strong>本地安全分析声明：</strong>
              MyFinder 不是杀毒软件，不提供病毒查杀或云端样本比对。本评估基于本地路径上下文、Windows
              Authenticode 数字签名、发布商凭据比对及进程活动状态进行保守解释与信任分类。
            </p>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0078d4]" />
              <span>正在审计本地数字签名与安全上下文...</span>
            </div>
          ) : assessment ? (
            <div className="space-y-4">
              {/* Trust State Hero Box */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${badge.bg}`}
              >
                <div className="flex items-center gap-3">
                  {badge.icon}
                  <div>
                    <div className="font-semibold text-sm">{badge.label}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      {assessment.isProtected
                        ? '系统核心关键路径，严禁未经授权的直接删除与破坏'
                        : assessment.trustState === 'trusted'
                        ? '已验证合规软件发布商数字证书与标准安装路径'
                        : assessment.trustState === 'needsReview'
                        ? '建议人工核对文件来源与证书可信度'
                        : '依据多维本地信号归类的综合信任状态'}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[10px] opacity-70">
                  {assessment.assessedAt}
                </span>
              </div>

              {/* Signals Overview Table */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 space-y-3">
                <div className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 border-b border-black/5 dark:border-white/5 pb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#0078d4]" />
                  <span>独立安全信号审计 (Independent Verification Signals)</span>
                </div>

                {/* 1. File Path & Classification */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>文件物理路径</span>
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">
                      {assessment.pathClassification === 'systemProtected'
                        ? '系统受保护路径'
                        : assessment.pathClassification === 'installedApp'
                        ? '已知安装程序目录'
                        : assessment.pathClassification === 'userDownloads'
                        ? '下载目录 (未筛选入口)'
                        : assessment.pathClassification === 'tempOrCache'
                        ? '临时目录 (Temp / Cache)'
                        : '用户数据目录'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-neutral-100 dark:bg-[#181818] font-mono text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center justify-between gap-2 break-all">
                    <span>{assessment.targetPath}</span>
                    <button
                      onClick={() => copyToClipboard(assessment.targetPath, '物理路径')}
                      className="text-neutral-400 hover:text-[#0078d4] shrink-0 cursor-pointer"
                    >
                      {copiedKey === '物理路径' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Authenticode Digital Signature */}
                <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Windows Authenticode 签名</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        assessment.signature.status === 'validSignature'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : assessment.signature.status === 'invalidSignature'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {assessment.signature.status === 'validSignature'
                        ? '有效数字签名'
                        : assessment.signature.status === 'invalidSignature'
                        ? '无效或已损坏签名'
                        : '未检测到数字签名 (Unsigned)'}
                    </span>
                  </div>

                  {assessment.signature.signer && (
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5 pl-2 border-l-2 border-emerald-500/40">
                      <div>
                        <strong>证书签名主体 (Signer)：</strong>
                        <span className="font-mono">{assessment.signature.signer}</span>
                      </div>
                      {assessment.signature.issuer && (
                        <div>
                          <strong>颁发机构 (Issuer)：</strong>
                          <span className="font-mono">{assessment.signature.issuer}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">
                    {assessment.signature.verificationMessage}
                  </p>
                </div>

                {/* 3. Publisher Correlation */}
                {assessment.publisherCorrelation.publisherName && (
                  <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">发布商一致性比对</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          assessment.publisherCorrelation.status === 'matched'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : assessment.publisherCorrelation.status === 'discrepancy'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {assessment.publisherCorrelation.status === 'matched'
                          ? '发布商与签名一致'
                          : assessment.publisherCorrelation.status === 'discrepancy'
                          ? '发布商存在差异警示'
                          : '单方凭据'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      {assessment.publisherCorrelation.details}
                    </p>
                  </div>
                )}

                {/* 4. Active Process State */}
                {assessment.isExecutableOrScript && (
                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span className="text-neutral-400">运行态主进程关联 (只读检测)</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        assessment.processAssociation.isRunning
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-[#0078d4] dark:text-blue-300 font-semibold'
                          : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {assessment.processAssociation.details}
                    </span>
                  </div>
                )}
              </div>

              {/* Explainability Reasons Box */}
              <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 space-y-2">
                <div className="font-semibold text-xs text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#0078d4]" />
                  <span>综合研判依据 (Explainable Rationale)</span>
                </div>
                <ul className="space-y-1 pl-4 list-disc text-[11px] text-neutral-700 dark:text-neutral-300">
                  {assessment.reasons.map((reason, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* On-Demand Cryptographic Hash Inspection */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-neutral-800 dark:text-neutral-200">
                    <Hash className="w-3.5 h-3.5 text-[#0078d4]" />
                    <span>按需计算 SHA-256 密码学指纹</span>
                  </div>

                  {!hashResult && (
                    <button
                      id="calculate-sha256-btn"
                      disabled={isHashing}
                      onClick={handleCalculateHash}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[#0078d4] hover:bg-[#006cbd] disabled:opacity-50 text-white transition-colors cursor-pointer"
                    >
                      {isHashing ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Hash className="w-3 h-3" />
                      )}
                      <span>{isHashing ? '计算中...' : '计算哈希'}</span>
                    </button>
                  )}
                </div>

                {hashResult ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-neutral-100 dark:bg-[#181818] font-mono text-[11px] text-neutral-800 dark:text-neutral-200 flex items-center justify-between gap-2 break-all border border-black/5 dark:border-white/5">
                      <span>{hashResult.hash}</span>
                      <button
                        onClick={() => copyToClipboard(hashResult.hash, 'SHA-256 哈希')}
                        className="text-neutral-400 hover:text-[#0078d4] shrink-0 cursor-pointer"
                        title="复制 SHA-256"
                      >
                        {copiedKey === 'SHA-256 哈希' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400">
                      <span>
                        算法: {hashResult.algorithm} • 文件大小:{' '}
                        {formatBytes(hashResult.fileSizeBytes)}
                      </span>
                      <span>耗时: {hashResult.calculationTimeMs} ms • 100% 本地运算</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-400">
                    大文件哈希计算需要耗费磁盘 I/O，MyFinder 坚持按需计算原则，绝不向任何外部服务上传哈希或元数据。
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-neutral-400">
              <AlertTriangle className="w-8 h-8 opacity-40 mx-auto mb-2" />
              <p>无法获取目标文件的安全与信任评估结果</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 dark:bg-[#202020] border-t border-black/5 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] text-neutral-400">
            <Shield className="w-3.5 h-3.5 text-[#0078d4]" />
            <span>MyFinder 纯本地隐私安全模型</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0078d4] text-white hover:bg-[#006cbd] transition-colors cursor-pointer"
          >
            关闭评估
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
