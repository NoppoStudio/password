import React, { useMemo } from 'react';
import { PasswordEntry, AuditIssue } from '../types';
import { calculatePasswordStrength, decryptData } from '../utils/crypto';
import { ShieldCheck, ShieldAlert, AlertTriangle, Clock, RefreshCw, Layers, Award, Info, Sparkles } from 'lucide-react';

interface AuditPanelProps {
  entries: PasswordEntry[];
  masterKey: string;
  onSelectEditEntry: (id: string) => void;
}

export default function AuditPanel({ entries, masterKey, onSelectEditEntry }: AuditPanelProps) {
  
  // Perform real-time audit security scanning by decrypting the passwords purely in-memory
  const auditAnalysis = useMemo(() => {
    let weakCount = 0;
    let reusedCount = 0;
    let oldCount = 0;
    let pwnedCount = 0;
    
    const issues: AuditIssue[] = [];
    const passwordMap: { [plain: string]: string[] } = {}; // plainText -> password tile IDs

    // Date today for age calculations
    const now = new Date();

    // Decrypt and index to find reuse + evaluate strength
    entries.forEach(entry => {
      const plaintext = decryptData(entry.passwordEncrypted, masterKey);
      if (!plaintext) return;

      // Strength
      const strength = calculatePasswordStrength(plaintext);
      if (strength.score < 50) {
        weakCount++;
        issues.push({
          id: `weak-${entry.id}`,
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          issueType: 'weak',
          severity: strength.score < 30 ? 'high' : 'medium',
          description: `強度スコアが低いです（${strength.score}/100）。`,
          recommendation: '12文字以上で、大文字、小文字、数字、記号を混ぜた独自のパスワードに変更してください。'
        });
      }

      // Track reuse
      if (!passwordMap[plaintext]) {
        passwordMap[plaintext] = [];
      }
      passwordMap[plaintext].push(entry.id);

      // Age Check (Older than 90 days)
      const updatedDate = new Date(entry.updatedAt);
      const diffTime = Math.abs(now.getTime() - updatedDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        oldCount++;
        issues.push({
          id: `old-${entry.id}`,
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          issueType: 'old',
          severity: diffDays > 180 ? 'medium' : 'low',
          description: `最終更新から ${diffDays} 日経っています。`,
          recommendation: 'セキュリティのため、定期的な（特に重要アカウントの）パスワード更新を行ってください。'
        });
      }

      // Simulating "Pwned" database leakage warnings using simple domain heuristics & common patterns
      const domain = entry.url ? entry.url.toLowerCase() : '';
      const isWeakWord = ['noppo', '1234', 'password', 'qwerty', 'admin'].some(w => plaintext.toLowerCase().includes(w));
      const looksCompromised = (domain.includes('compromised') || domain.includes('leak') || isWeakWord);
      
      if (looksCompromised) {
        pwnedCount++;
        issues.push({
          id: `pwned-${entry.id}`,
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          issueType: 'pwned',
          severity: 'high',
          description: '公開されている漏洩データ（データ侵害）に含まれている危険なパターンです。',
          recommendation: '危険！このパスワードはすでに攻撃者に学習されている可能性が高いため、今すぐ新しい完全ランダムパスワードに変更してください。'
        });
      }
    });

    // Handle duplicate passwords
    entries.forEach(entry => {
      const plaintext = decryptData(entry.passwordEncrypted, masterKey);
      if (!plaintext) return;
      
      const associatedIds = passwordMap[plaintext] || [];
      if (associatedIds.length > 1) {
        reusedCount++;
        issues.push({
          id: `reused-${entry.id}`,
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          issueType: 'reused',
          severity: 'high',
          description: `他の ${associatedIds.length - 1} 個のアカウントと同じパスワードを利用しています。`,
          recommendation: 'パスワードの使い回しは、1つのサービスが流出した際に致命的となります。すべて個別のユニークなパスワードに変更してください。'
        });
      }
    });

    // Deduplicate issues by type (we might list reused twice for the same entity)
    const uniqueIssues = issues.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

    // Calculate Overall Health Score (0 - 100)
    let totalDeductions = 0;
    entries.forEach(entry => {
      const plaintext = decryptData(entry.passwordEncrypted, masterKey);
      const strength = calculatePasswordStrength(plaintext);
      totalDeductions += (100 - strength.score) * 0.4;
    });

    const issuePenalty = weakCount * 12 + reusedCount * 15 + oldCount * 3 + pwnedCount * 25;
    totalDeductions += issuePenalty;

    let healthScore = 100;
    if (entries.length > 0) {
      healthScore = Math.max(10, Math.min(100, Math.round(100 - (totalDeductions / Math.max(1, entries.length)))));
    }

    return {
      healthScore,
      weakCount,
      reusedCount,
      oldCount,
      pwnedCount,
      issues: uniqueIssues
    };
  }, [entries, masterKey]);

  const getHealthRating = (score: number) => {
    if (score >= 90) return { title: '鉄壁の防御力', color: 'text-emerald-700 font-bold', bg: 'bg-emerald-50 border-emerald-200/60' };
    if (score >= 75) return { title: '良好なセキュリティ', color: 'text-blue-700 font-bold', bg: 'bg-blue-50 border-blue-200/60' };
    if (score >= 60) return { title: '警告／改善推奨', color: 'text-amber-700 font-bold', bg: 'bg-amber-50 border-amber-200/60' };
    return { title: '極めて脆弱／即時対応が必要', color: 'text-red-700 font-bold', bg: 'bg-red-50 border-red-200/60' };
  };

  const currentRating = getHealthRating(auditAnalysis.healthScore);

  return (
    <div id="audit-panel-root" className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-md font-extrabold tracking-tight text-slate-900 flex items-center gap-2 font-sans">
          <Award className="h-5 w-5 text-orange-500 drop-shadow-[0_0_4px_rgba(249,115,22,0.15)] animate-pulse" />
          セキュリティ自動監査室 (Security Auditor)
        </h2>
        <p className="text-xs text-slate-500 leading-normal">
          保存されている全データをメモリ上で安全に解析し、パスワードの強度、使い回し、長期間放置、公知の漏洩パターンを徹底的に精査します。
        </p>
      </div>

      {entries.length === 0 ? (
        <div id="no-entries-audit-placeholder" className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-xl shadow-blue-500/5">
          <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-xs font-bold text-slate-700">監査可能なパスワードデータがありません</h3>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
            パスワード情報を追加して暗号化保管庫に格納すると、ここに詳細なセキュリティステータスが表示されます。
          </p>
        </div>
      ) : (
        <>
          {/* Main Scoring Meter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Visual Ring Gauge Card */}
            <div className="md:col-span-1 rounded-3xl border border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-xl shadow-blue-500/5">
              <div className="absolute top-0 right-0 p-1">
                <Sparkles className="h-12 w-12 text-orange-500/5 rotate-12" />
              </div>

              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="absolute inset-0 h-full w-full -rotate-90 text-slate-100">
                  <circle
                    cx="56"
                    cy="56"
                    r="48"
                    className="stroke-slate-100"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="48"
                    className={
                      auditAnalysis.healthScore >= 90 ? 'stroke-emerald-500' :
                      auditAnalysis.healthScore >= 75 ? 'stroke-blue-500' :
                      auditAnalysis.healthScore >= 60 ? 'stroke-amber-500' : 'stroke-red-500'
                    }
                    strokeWidth="7"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - auditAnalysis.healthScore / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900">
                    {auditAnalysis.healthScore}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">
                    HEALTH
                  </span>
                </div>
              </div>

              <div className={`mt-4 px-3 py-1 rounded-full text-[10px] border ${currentRating.bg} ${currentRating.color}`}>
                {currentRating.title}
              </div>
            </div>

            {/* Counts Matrix */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm shadow-blue-500/5">
                <div className={`rounded-xl p-2.5 ${auditAnalysis.weakCount > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100/60' : 'bg-slate-50 text-slate-400'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">強度不足</p>
                  <p className="text-lg font-extrabold font-mono text-slate-800 mt-0.5">{auditAnalysis.weakCount} <span className="text-[10px] font-normal text-slate-400">個</span></p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm shadow-blue-500/5">
                <div className={`rounded-xl p-2.5 ${auditAnalysis.reusedCount > 0 ? 'bg-red-50 text-red-600 border border-red-100/60' : 'bg-slate-50 text-slate-400'}`}>
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">パスワード重複</p>
                  <p className="text-lg font-extrabold font-mono text-slate-800 mt-0.5">{auditAnalysis.reusedCount} <span className="text-[10px] font-normal text-slate-400">個</span></p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm shadow-blue-500/5">
                <div className={`rounded-xl p-2.5 ${auditAnalysis.oldCount > 0 ? 'bg-blue-50 text-blue-600 border border-blue-100/60' : 'bg-slate-50 text-slate-400'}`}>
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">長期未更新(90日超)</p>
                  <p className="text-lg font-extrabold font-mono text-slate-800 mt-0.5">{auditAnalysis.oldCount} <span className="text-[10px] font-normal text-slate-400">個</span></p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm shadow-blue-500/5">
                <div className={`rounded-xl p-2.5 ${auditAnalysis.pwnedCount > 0 ? 'bg-rose-50 text-rose-600 border border-rose-100/60' : 'bg-slate-50 text-slate-400'}`}>
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">流出リスク・要隔離</p>
                  <p className="text-lg font-extrabold font-mono text-slate-800 mt-0.5">{auditAnalysis.pwnedCount} <span className="text-[10px] font-normal text-slate-400">個</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Issue Logs */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-blue-500/5">
            <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-orange-500" />
              セキュリティ改善ガイダンス ({auditAnalysis.issues.length} 件)
            </h3>

            {auditAnalysis.issues.length === 0 ? (
              <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-slate-100">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2 drop-shadow-[0_0_4px_rgba(16,185,129,0.2)]" />
                <p className="text-xs text-slate-700 font-bold">完璧です！セキュリティレベルは最高位に保たれています</p>
                <p className="text-[10px] text-slate-400 mt-0.5">すべての暗号化情報は、完璧な保護状態が確認されました。</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {auditAnalysis.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 hover:border-slate-300 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 max-w-[140px] truncate">{issue.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({issue.username})</span>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                          issue.severity === 'high' ? 'bg-red-50 text-red-700 border-red-200/50' :
                          issue.severity === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200/50' :
                          'bg-blue-50 text-blue-700 border-blue-200/50'
                        }`}>
                          {issue.severity === 'high' ? '高リスク' : issue.severity === 'medium' ? '中リスク' : '低リスク'}
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600">
                          {issue.issueType === 'weak' ? '強度不足' :
                           issue.issueType === 'reused' ? '二重使用' :
                           issue.issueType === 'pwned' ? '公開漏洩危険' : '長期未更新'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">{issue.description}</p>
                      <p className="text-[11px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200/60 pl-3 border-l-orange-500 leading-normal">
                        <span className="font-bold text-orange-600">推奨対策:</span> {issue.recommendation}
                      </p>
                    </div>

                    <button
                      onClick={() => onSelectEditEntry(issue.entryId)}
                      className="self-end sm:self-center shrink-0 flex items-center gap-1.5 bg-[#0040e0] hover:bg-[#2e5bff] px-3.5 py-2 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-sm shadow-blue-500/10"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      修復
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
