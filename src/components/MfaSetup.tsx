import React, { useState, useEffect } from 'react';
import { generateBase32Secret, generateBackupCodes, verifyTOTP } from '../utils/mfa';
import { ShieldCheck, KeyRound, Copy, Check, Smartphone, CircleAlert, Eye, EyeOff } from 'lucide-react';

interface MfaSetupProps {
  isMfaEnabled: boolean;
  mfaSecret: string;
  mfaBackupCodes: string[];
  userEmail: string;
  onSaveMfaSettings: (secret: string, enabled: boolean, backupCodes: string[]) => void;
  onClose: () => void;
}

export default function MfaSetup({
  isMfaEnabled,
  mfaSecret,
  mfaBackupCodes,
  userEmail,
  onSaveMfaSettings,
  onClose
}: MfaSetupProps) {
  // Setup workflow states
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [userCode, setUserCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  // Initialize values when setting up
  useEffect(() => {
    if (!isMfaEnabled) {
      const newSecret = generateBase32Secret();
      const codes = generateBackupCodes();
      setSecret(newSecret);
      setBackupCodes(codes);
      setStep(1);
    } else {
      setSecret(mfaSecret);
      setBackupCodes(mfaBackupCodes);
    }
    setVerificationError('');
  }, [isMfaEnabled, mfaSecret, mfaBackupCodes]);

  const otpauthUrl = `otpauth://totp/NoppoPassword:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=NoppoPassword`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`;

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyAndEnable = () => {
    setVerificationError('');
    if (userCode.length !== 6) {
      setVerificationError('6桁のコードを入力してください。');
      return;
    }

    const isValid = verifyTOTP(secret, userCode);
    if (isValid) {
      // Go to backup codes screen
      setStep(3);
    } else {
      setVerificationError('認証コードが異なります。アプリの時間と同期しているか確認してください。');
    }
  };

  const finalizeMfa = () => {
    onSaveMfaSettings(secret, true, backupCodes);
    onClose();
  };

  const disableMfa = () => {
    if (window.confirm('本当に専用二要素認証（MFA）を無効化しますか？セキュリティレベルが低下します！')) {
      onSaveMfaSettings('', false, []);
      onClose();
    }
  };

  return (
    <div id="mfa-setup-root" className="rounded-3xl border border-slate-200 bg-white p-6 max-w-xl mx-auto space-y-6 shadow-xl shadow-blue-500/5 animate-fadeIn">
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-md font-extrabold text-slate-900 flex items-center gap-2 font-sans">
            <KeyRound className="h-5 w-5 text-blue-600 drop-shadow-[0_0_4px_rgba(37,99,235,0.15)]" />
            NoppoPassword 専用二要素認証 (MFA)
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-normal">
            ワンタイムパスワード（TOTP）による強固なセキュリティ二重保護を有効にします。
          </p>
        </div>
        <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
          isMfaEnabled 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
            : 'bg-red-50 text-red-700 border-red-200/60'
        }`}>
          {isMfaEnabled ? '有効中' : '未設定'}
        </span>
      </div>

      {isMfaEnabled ? (
        // MFA is already enabled, show current status and option to turn off
        <div id="mfa-status-enabled" className="space-y-5">
          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-900 leading-normal">二要素認証（MFA）による高度な二重ロックが有効になっています</p>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                アカウントにログインする、または保管庫の重要なパスワードを参照する際、認証マネージャーアプリ（Google Authenticatorなど）に表示される現在の認証コードが必要になります。
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800">MFA（二要素認証）専用・緊急スキップコード</h4>
            <p className="text-[10px] text-slate-500 leading-normal">
              ※TOTPアプリが使えない場合に二要素認証をスキップするためのコードです。マスターパスキー紛失時の保管庫データ復元には使用できません。各コード1回限り有効。
            </p>
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 font-mono text-center text-xs grid grid-cols-2 gap-2 text-slate-700 select-all">
              {backupCodes.map((code, idx) => (
                <span key={idx} className="tracking-wider bg-white rounded-lg py-1 border border-slate-100">{code}</span>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={handleCopyBackupCodes}
                className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 cursor-pointer shadow-sm transition"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 font-extrabold" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                コードを一括コピー
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/60 flex justify-between gap-3">
            <button
              onClick={disableMfa}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition cursor-pointer"
            >
              MFAを無効化する
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : (
        // Workflow to self-setup TOTP MFA
        <div id="mfa-workflow-wizard">
          {step === 1 && (
            <div id="mfa-setup-step-1" className="space-y-5">
              <div className="flex gap-2 items-center">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>
                <h3 className="text-xs font-bold text-slate-900 font-sans">認証アプリでQRコードをスキャン</h3>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <div className="bg-white p-3 rounded-xl shadow-md border border-slate-200/60 flex-shrink-0">
                  <img src={qrCodeUrl} alt="Scan to sync Google Authenticator" className="w-[140px] h-[140px]" referrerPolicy="no-referrer" />
                </div>
                
                <div className="space-y-3 flex-1 text-center md:text-left">
                  <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium">
                    Google Authenticator, Microsoft Authenticator, または 1Password などの認証アプリを開き、スキャンしてください。
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    カメラでスキャンできない場合は、以下の秘密鍵をキーボードで直接手動登録してください：
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-full max-w-sm mx-auto md:mx-0 shadow-sm">
                    <span className="font-mono text-[11px] text-blue-700 font-bold tracking-wider flex-1 overflow-x-auto select-all">
                      {isSecretVisible ? secret : '•••• •••• •••• ••••'}
                    </span>
                    <button
                      onClick={() => setIsSecretVisible(!isSecretVisible)}
                      className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    >
                      {isSecretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={handleCopySecret}
                      className="p-1 text-slate-400 hover:text-slate-700 transition border-l border-slate-100 pl-2 cursor-pointer"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 font-extrabold" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  onClick={() => setStep(2)}
                  className="bg-[#0040e0] hover:bg-[#2e5bff] px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm shadow-blue-500/10 cursor-pointer transition flex items-center gap-1.5"
                >
                  <Smartphone className="h-4 w-4" />
                  コード検証に進む
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div id="mfa-setup-step-2" className="space-y-5">
              <div className="flex gap-2 items-center">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">2</span>
                <h3 className="text-xs font-bold text-slate-900 font-sans">6桁の認証コードの入力</h3>
              </div>

              <p className="text-xs text-slate-600 leading-normal">
                お使いの認証マネージャーアプリに追加された「NoppoPassword」のセキュリティコード（6桁）を入力してください。
              </p>

              <div className="max-w-xs mx-auto text-center space-y-4 py-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value.replace(/\D/g, ''))}
                  className="w-40 text-center font-mono text-xl tracking-[10px] pl-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition"
                />

                {verificationError && (
                  <p className="text-[11px] text-red-600 px-4 flex items-center gap-1 justify-center font-bold">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                    {verificationError}
                  </p>
                )}
              </div>

              <div className="flex justify-between pt-3 gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 transition cursor-pointer"
                >
                  戻る
                </button>
                <button
                  onClick={handleVerifyAndEnable}
                  className="bg-[#0040e0] hover:bg-[#2e5bff] px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer"
                >
                  検証して有効化
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div id="mfa-setup-step-3" className="space-y-5 animate-fadeIn">
              <div className="flex gap-2 items-center">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">✓</span>
                <h3 className="text-xs font-bold text-slate-900 font-sans">二要素認証（MFA）が有効になりました！</h3>
              </div>

              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-xs text-slate-600 space-y-2 leading-relaxed">
                <p className="font-bold text-emerald-800 text-xs">MFA（二要素認証）専用・緊急スキップコード</p>
                <p>
                  スマートフォンの故障や紛失などで二要素認証（OTP）アプリを利用できなくなった場合、以下のスキップコードを使って二要素認証の関門を一時的に解除し、ログインすることができます。
                </p>
                <p className="text-amber-700 font-bold">
                  【ご注意】このコードはマスターパスキー（マスターキー）の代わりにはなりません。マスターパスキー紛失時の「保管庫データ復元」は、設定画面から別途生成する「保管庫暗号復元キー」を使用します。
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 font-mono text-center text-xs grid grid-cols-2 gap-2 text-slate-800 select-all">
                {backupCodes.map((code, idx) => (
                  <span key={idx} className="tracking-wider bg-white rounded-lg py-1.5 border border-slate-100 shadow-sm">{code}</span>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-100 gap-2">
                <button
                  onClick={handleCopyBackupCodes}
                  className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-sm cursor-pointer transition"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600 font-extrabold" /> : <Copy className="h-4 w-4 text-slate-400" />}
                  コードをコピー
                </button>
                <button
                  onClick={finalizeMfa}
                  className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg shadow-emerald-600/10 cursor-pointer transition"
                >
                  設定を完了
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
