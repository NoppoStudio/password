import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, X, CheckCircle, Smartphone, AlertCircle, ShieldCheck } from 'lucide-react';

interface BiometricModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentialId?: string, rawId?: string, isFallback?: boolean) => void;
  actionType: 'setup' | 'unlock';
  biometricType: 'fingerprint' | 'face' | 'none'; // Kept for interface compatibility
  allowedCredentialId?: string;
}

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function BiometricModal({
  isOpen,
  onClose,
  onSuccess,
  actionType,
  allowedCredentialId
}: BiometricModalProps) {
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [webauthnError, setWebauthnError] = useState<string | null>(null);
  const [showFallbackConfirm, setShowFallbackConfirm] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScanStatus('idle');
      setScanProgress(0);
      setWebauthnError(null);
      setShowFallbackConfirm(false);
    } else {
      clearScanningTimer();
    }
    return () => clearScanningTimer();
  }, [isOpen]);

  const clearScanningTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Run native WebAuthn
  const runWebAuthn = async (): Promise<{ credentialId: string; rawId: string }> => {
    if (!window.PublicKeyCredential) {
      throw new Error('このブラウザまたはデバイスでは、標準のWebAuthn（生体認証/セキュリティキー）がサポートされていません。');
    }

    const randomBytes = new Uint8Array(16);
    window.crypto.getRandomValues(randomBytes);

    if (actionType === 'setup') {
      const rpName = "NoppoPassword";
      const userName = "noppo-user-" + Date.now();
      
      const creationOptions: PublicKeyCredentialCreationOptions = {
        challenge: randomBytes,
        rp: {
          name: rpName,
          id: window.location.hostname || "localhost"
        },
        user: {
          id: randomBytes,
          name: userName,
          displayName: userName
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" } // RS256
        ],
        authenticatorSelection: {
          userVerification: "required", // Ensure secure local biometric/PIN confirmation
          authenticatorAttachment: "platform" // Use built-in biometrics like Touch ID / Face ID / Windows Hello
        },
        timeout: 60000
      };

      const credential = await navigator.credentials.create({
        publicKey: creationOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('生体認証資格情報の作成に失敗しました。');
      }

      const credIdB64 = arrayBufferToBase64(credential.rawId);
      return { credentialId: credIdB64, rawId: credIdB64 };
    } else {
      if (!allowedCredentialId) {
        throw new Error('生体認証の紐づけ情報が見つかりません。通常のマスターパスコードで一度ログインしてください。');
      }

      const rawIdBuffer = base64ToArrayBuffer(allowedCredentialId);
      const assertionOptions: PublicKeyCredentialRequestOptions = {
        challenge: randomBytes,
        allowCredentials: [{
          id: rawIdBuffer,
          type: "public-key"
        }],
        userVerification: "required",
        timeout: 60000
      };

      const assertion = await navigator.credentials.get({
        publicKey: assertionOptions
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error('生体認証の取得に失敗しました。');
      }

      const credIdB64 = arrayBufferToBase64(assertion.rawId);
      return { credentialId: credIdB64, rawId: credIdB64 };
    }
  };

  // Perform pseudo fallback scan animation
  const handleStartPseudoScanning = () => {
    setShowFallbackConfirm(false);
    setScanStatus('scanning');
    setScanProgress(0);

    const interval = 30; // ms
    const duration = 2000; // ms
    const increment = 100 / (duration / interval);

    const timer = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setScanStatus('success');
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          
          setTimeout(() => {
            onSuccess(undefined, undefined, true);
          }, 1200);
          return 100;
        }
        return Math.min(100, prev + increment);
      });
    }, interval);

    timerRef.current = timer;
  };

  // Main Action handler
  const handleStartScanning = async () => {
    // Check support
    if (!window.PublicKeyCredential) {
      console.warn('PublicKeyCredential is not supported by browser.');
      setWebauthnError('このブラウザまたはOSは標準のWebAuthn APIによる生体認証デバイス制御に対応していません。');
      setShowFallbackConfirm(true);
      return;
    }

    try {
      setScanStatus('scanning');
      setWebauthnError(null);
      
      const result = await runWebAuthn();
      
      setScanProgress(100);
      setScanStatus('success');
      
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => {
        onSuccess(result.credentialId, result.rawId, false);
      }, 1200);
    } catch (err: any) {
      console.error('WebAuthn process error:', err);
      
      // Check if user cancelled
      if (err.name === 'NotAllowedError' && !err.message.includes('iframe') && !err.message.includes('policy')) {
        setScanStatus('idle');
        return;
      }

      // Security / Frame policy constraint or device issues
      const errMessage = err.message || '';
      let errorMsg = '生体認証の処理中にエラーが発生しました。';
      if (errMessage.includes('iframe') || err.name === 'SecurityError') {
        errorMsg = 'セキュリティコンテキスト制限（プレビュー内の制限等）により、標準の生体認証機能にアクセスできませんでした。';
      } else if (err.name === 'NotSupportedError') {
        errorMsg = 'お使いのデバイスに生体認証（デバイス認証）ハードウェアが未設定、または無効化されています。';
      } else if (errMessage) {
        errorMsg = errMessage;
      }

      setWebauthnError(errorMsg);
      setShowFallbackConfirm(true);
      setScanStatus('idle');
    }
  };

  const cancelScanning = () => {
    clearScanningTimer();
    setScanStatus('idle');
    setScanProgress(0);
  };

  if (!isOpen) return null;

  return (
    <div id="biometric-outer-wrapper" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[6px]"
      />

      {/* Modal Content */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl z-10 p-6 shadow-blue-900/10 animate-fadeIn"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 rounded-full bg-blue-50 p-3 text-blue-600 border border-blue-100/60 shadow-sm">
            <Smartphone className="h-5 w-5" />
          </div>
          
          <h2 className="text-md font-extrabold tracking-tight text-slate-900 font-sans">
            {actionType === 'setup' ? '生体認証の設定' : '生体認証でロック解除'}
          </h2>
          <p className="mt-1 text-xs text-slate-500 px-4 leading-normal font-sans">
            {actionType === 'setup' 
              ? 'お使いのデバイスに搭載された安全な生体認証（デバイス本体の認証システム）とアプリを紐づけます。' 
              : '生体認証またはデバイス認証（指紋や顔など）によるセキュア解錠を実行します。'}
          </p>

          <AnimatePresence mode="wait">
            {showFallbackConfirm ? (
              /* Fallback Prompt Panel */
              <motion.div
                key="fallback-prompt"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="my-5 p-4 bg-orange-50 rounded-2xl border border-orange-100/80 text-left space-y-3.5"
              >
                <div className="flex gap-2 text-orange-700">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold font-sans">セキュア認証に制限があります</p>
                    <p className="text-[10px] text-orange-600/95 leading-normal font-sans">
                      {webauthnError || 'ブラウザのセキュリティ制限やハードウェア等の要因で起動できませんでした。'}
                    </p>
                  </div>
                </div>
                <div className="bg-white/60 p-2.5 rounded-lg border border-orange-100 text-[9px] text-slate-500 leading-normal">
                  <span className="font-bold">フォールバック演出:</span> デバイス側の制約がある環境でも、高精度のシミュレーション演出（疑似セキュアスキャン）を使用して生体認証の設定・利用フローを検証可能です。
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleStartPseudoScanning}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-xl text-[10.5px] transition shadow-sm cursor-pointer"
                  >
                    疑似セキュアスキャンを開始
                  </button>
                  <button
                    onClick={() => setShowFallbackConfirm(false)}
                    className="w-1/3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-medium py-2 px-2 rounded-xl text-[10.5px] transition cursor-pointer"
                  >
                    戻る
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Standard Scanner Visualization */
              <motion.div
                key="scanner-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center"
              >
                {/* Scanner Visualization Area */}
                <div className="relative mt-6 mb-6 flex h-44 w-44 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden shadow-inner">
                  {scanStatus === 'idle' && (
                    <button
                      onClick={handleStartScanning}
                      className="group flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-800 transition w-full h-full cursor-pointer"
                    >
                      <Fingerprint className="h-14 w-14 text-slate-300 group-hover:text-blue-600 transition-colors duration-300" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 select-none flex items-center gap-1 font-sans">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
                        認証を開始する
                      </span>
                    </button>
                  )}

                  {scanStatus === 'scanning' && (
                    <div className="relative flex h-full w-full flex-col items-center justify-center">
                      <div className="relative flex items-center justify-center z-10">
                        <Fingerprint className="h-14 w-14 text-blue-600 animate-pulse" />
                        <svg className="absolute -inset-4 h-22 w-22 -rotate-90">
                          <circle
                            cx="44"
                            cy="44"
                            r="36"
                            className="stroke-slate-200"
                            strokeWidth="3"
                            fill="transparent"
                          />
                          <motion.circle
                            cx="44"
                            cy="44"
                            r="36"
                            className="stroke-blue-600"
                            strokeWidth="3"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 36}
                            strokeDashoffset={2 * Math.PI * 36 * (1 - scanProgress / 100)}
                          />
                        </svg>
                      </div>

                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/80 text-[9px] uppercase tracking-widest font-mono text-white z-20">
                        検証中 {Math.round(scanProgress)}%
                      </span>
                    </div>
                  )}

                  {scanStatus === 'success' && (
                    <motion.div 
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="flex flex-col items-center justify-center gap-2 text-emerald-600 font-bold"
                    >
                      <CheckCircle className="h-12 w-12 text-emerald-500 drop-shadow-[0_0_4px_rgba(16,185,129,0.3)]" />
                      <span className="text-[10px] uppercase font-mono tracking-wider">
                        認証成功
                      </span>
                    </motion.div>
                  )}
                </div>

                <div className="w-full">
                  {scanStatus === 'scanning' && (
                    <button
                      onClick={cancelScanning}
                      className="w-full border border-slate-200 hover:bg-slate-50 py-1.5 px-4 rounded-xl text-xs font-bold text-slate-500 transition cursor-pointer font-sans"
                    >
                      キャンセル
                    </button>
                  )}
                  
                  {scanStatus === 'idle' && (
                    <div className="space-y-1 px-2">
                      <p className="text-[10px] text-slate-400 select-none leading-normal font-sans">
                        OS標準のセキュリティ確認が起動します。Touch IDやFace IDなど、お使いのデバイスで普段利用されている生体認証を実行してください。
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
