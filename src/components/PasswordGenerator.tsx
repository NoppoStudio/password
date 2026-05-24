import React, { useState, useEffect } from 'react';
import { generateSecurePassword, calculatePasswordStrength, StrengthResult } from '../utils/crypto';
import { Copy, RefreshCw, Check, ShieldCheck, Sparkles } from 'lucide-react';

interface PasswordGeneratorProps {
  onSelectPassword?: (password: string) => void;
  inline?: boolean;
}

export default function PasswordGenerator({ onSelectPassword, inline = false }: PasswordGeneratorProps) {
  const [length, setLength] = useState(16);
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeLower, setIncludeLower] = useState(true);
  const [includeDigits, setIncludeDigits] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [strength, setStrength] = useState<StrengthResult>({
    score: 0,
    feedback: [],
    color: 'bg-slate-400',
    status: 'Weak'
  });

  const generate = () => {
    const pw = generateSecurePassword(length, includeUpper, includeLower, includeDigits, includeSymbols);
    setPassword(pw);
    setCopied(false);
  };

  useEffect(() => {
    generate();
  }, [length, includeUpper, includeLower, includeDigits, includeSymbols]);

  useEffect(() => {
    if (password) {
      setStrength(calculatePasswordStrength(password));
    }
  }, [password]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  return (
    <div id="password-generator-card" className={`rounded-3xl border border-slate-200 bg-white p-6 ${inline ? '' : 'shadow-xl shadow-blue-500/5'} animate-fadeIn`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-sans">
          <Sparkles className="h-4 w-4 text-orange-500 animate-pulse" />
          超強力パスワード自動生成
        </h3>
        <span className="text-[9px] uppercase font-bold tracking-wider bg-orange-50 text-orange-700 border border-orange-200/50 px-2 py-0.5 rounded-full font-sans">
          CRYPT_RANDOM
        </span>
      </div>

      {/* Generated Field Display */}
      <div className="relative mb-4 flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 shadow-inner">
        <span className="text-xs font-mono tracking-wider text-slate-800 select-all overflow-x-auto whitespace-pre pr-14 scrollbar-none w-full font-bold">
          {password || '生成中...'}
        </span>
        <div className="absolute right-2 flex gap-1">
          <button
            onClick={generate}
            title="再生成"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            title="コピー"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 font-extrabold" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Strength Indicator */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-1.5 text-[11px]">
          <span className="text-slate-500 font-medium">強度判定:</span>
          <span className={`font-sans font-bold ${
            strength.status === 'Strong' ? 'text-emerald-600' :
            strength.status === 'Good' ? 'text-blue-600' :
            strength.status === 'Fair' ? 'text-amber-600' : 'text-red-600'
          }`}>
            {strength.status === 'Strong' ? '最強 (Strong)' :
             strength.status === 'Good' ? '良好 (Good)' :
             strength.status === 'Fair' ? '普通 (Fair)' : '危険 (Weak)'} ({strength.score}/100)
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
          <div
            className={`h-full transition-all duration-300 ${
              strength.status === 'Strong' ? 'bg-emerald-500' :
              strength.status === 'Good' ? 'bg-blue-500' :
              strength.status === 'Fair' ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${strength.score}%` }}
          />
        </div>
        {strength.feedback.length > 0 && (
          <div className="mt-2 text-[10px] text-slate-400 space-y-0.5 leading-normal">
            {strength.feedback.map((f, idx) => (
              <p key={idx} className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-orange-500" />
                {f}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Options Panel */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <div>
          <div className="flex justify-between text-xs mb-1.5 font-sans">
            <span className="text-slate-500 font-medium">文字数:</span>
            <span className="text-orange-600 font-mono font-bold">{length} 文字</span>
          </div>
          <input
            type="range"
            min="8"
            max="64"
            value={length}
            onChange={(e) => setLength(parseInt(e.target.value))}
            className="w-full accent-orange-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none font-bold">
            <input
              type="checkbox"
              checked={includeUpper}
              onChange={(e) => setIncludeUpper(e.target.checked)}
              className="accent-orange-500 rounded border-slate-300"
            />
            大文字 [A-Z]
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none font-bold">
            <input
              type="checkbox"
              checked={includeLower}
              onChange={(e) => setIncludeLower(e.target.checked)}
              className="accent-orange-500 rounded border-slate-300"
            />
            小文字 [a-z]
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none font-bold">
            <input
              type="checkbox"
              checked={includeDigits}
              onChange={(e) => setIncludeDigits(e.target.checked)}
              className="accent-orange-500 rounded border-slate-300"
            />
            数字 [0-9]
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none font-bold">
            <input
              type="checkbox"
              checked={includeSymbols}
              onChange={(e) => setIncludeSymbols(e.target.checked)}
              className="accent-orange-500 rounded border-slate-300"
            />
            記号 [@#$%^&*]
          </label>
        </div>
      </div>

      {onSelectPassword && (
        <button
          onClick={() => onSelectPassword(password)}
          className="mt-5 w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white rounded-xl py-2.5 px-4 text-xs font-bold transition shadow-md shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ShieldCheck className="h-4 w-4" />
          このパスワードを適用する
        </button>
      )}
    </div>
  );
}
