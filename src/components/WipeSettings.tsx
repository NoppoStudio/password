import React, { useState } from 'react';
import { hashSHA256 } from '../utils/crypto';
import { ShieldAlert, Trash2, Check, CircleAlert, Eye, EyeOff } from 'lucide-react';

interface WipeSettingsProps {
  failedAttemptsLimit: number;
  silentWipeCodeEncrypted: string; // SHA-256 hash of the code
  onSaveWipeSettings: (limit: number, silentWipeCodeHash: string) => void;
  onClearAllData: () => void;
}

export default function WipeSettings({
  failedAttemptsLimit,
  silentWipeCodeEncrypted,
  onSaveWipeSettings,
  onClearAllData
}: WipeSettingsProps) {
  const [limit, setLimit] = useState(failedAttemptsLimit);
  const [rawWipeCode, setRawWipeCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = () => {
    setSuccessMsg('');
    let hash = silentWipeCodeEncrypted; // Keep current hash if unchanged
    
    if (rawWipeCode.trim()) {
      hash = hashSHA256(rawWipeCode.trim());
    }

    onSaveWipeSettings(limit, hash);
    setRawWipeCode('');
    setSuccessMsg('緊急自動ワイプ設定が更新、保存されました。');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleManualWipe = () => {
    if (window.confirm('警告：すべての暗号化されたパスワード、保管庫パスキー、MFA設定を含む「すべてのデータ」が即時に物理ワイプ（消去）されます。この操作は絶対に復元できません。本当によろしいですか？')) {
      onClearAllData();
    }
  };

  return (
    <div id="wipe-settings-card" className="rounded-3xl border border-slate-200 bg-white p-6 max-w-xl mx-auto space-y-6 shadow-xl shadow-blue-500/5 animate-fadeIn">
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-md font-extrabold text-slate-900 flex items-center gap-2 font-sans">
            <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
            自己防衛 / 緊急自動データ消滅機能 (Self-Destruct)
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-normal">
            強迫や情報抜き取りの脅威から、個人データを徹底して死守・永久消滅させるための防衛メカニズム。
          </p>
        </div>
      </div>

      {/* Wipe Trigger Limit */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-800">
          失敗連動ワイプ (ログイン失敗回数制限)
        </label>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          アプリ起動時の暗証番号／保管庫パスキー、または生体認証の検証を連続して指定回数失敗した際、
          デバイス内からすべての暗号鍵・パスワードデータを一瞬にして完全消去（ワイプ）して自動防衛します。
        </p>
        <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
          <div className="w-full">
            <div className="flex justify-between text-xs mb-1.5 font-sans">
              <span className="text-slate-500 font-medium">ロック失敗許容回数:</span>
              <span className="text-red-600 font-extrabold">{limit} 回で自動消滅</span>
            </div>
            <input
              type="range"
              min="3"
              max="10"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Secret Silent Self-Destruct Code */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-800">
          サイレント自己消滅コード
        </label>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          外部からロック解除を強要された際に役立つフェイク用パスキーです。ロック解除画面で本来のパスキーの代わりに
          このコードを入力すると、<b>「ログイン処理中...」と見せかけつつ、裏ですべてのデータを完全かつ即時に削除</b>
          し、安全な初期リセット画面（空の保管庫）へ自動移行します。
        </p>
        <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-3">
          <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-xl px-3 py-2 max-w-md shadow-sm">
            <input
              type={showCode ? 'text' : 'password'}
              placeholder={silentWipeCodeEncrypted ? '•••••••• (登録済み、長押しで上書き可能)' : '自己消滅コードを設定'}
              value={rawWipeCode}
              onChange={(e) => setRawWipeCode(e.target.value)}
              className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full font-sans"
            />
            <button
              onClick={() => setShowCode(!showCode)}
              className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer flex-shrink-0"
              title={showCode ? '非表示' : '表示'}
            >
              {showCode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <span className="text-[10px] text-slate-400 block leading-normal">
            ※通常のパスワード、MFA緊急バックアップコードとはまったく別の、無関係な単語や文字列を登録してください。
          </span>
        </div>
      </div>

      {/* Manual Immediate Destruct Button */}
      <div className="pt-2">
        <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold text-red-600 flex items-center gap-1.5">
              <CircleAlert className="h-4 w-4" />
              手動物理ワイプ（現在のデータを即時、永久抹消）
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              データはサーバーを経由せずローカルにのみ保存されているため、消去を実行すると絶対に復元できません。
            </p>
          </div>
          <button
            onClick={handleManualWipe}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 active:scale-95 px-4 py-2 rounded-xl text-xs font-bold text-white transition shrink-0 cursor-pointer shadow-sm shadow-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            データを今すぐ完全消去
          </button>
        </div>
      </div>

      {/* Bottom Save bar */}
      <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-emerald-600">
          {successMsg && (
            <span className="flex items-center gap-1 animate-fadeIn">
              <Check className="h-4 w-4 font-extrabold" />
              {successMsg}
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          className="bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer"
        >
          設定を保存
        </button>
      </div>
    </div>
  );
}
