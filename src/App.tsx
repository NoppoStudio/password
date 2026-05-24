import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Lock, Unlock, KeyRound, Key, RefreshCw, Eye, EyeOff, Clipboard,
  Check, Trash2, Edit3, Plus, Search, Folder, Globe, Mail, Terminal,
  Settings, LogOut, FileText, AlertTriangle, Fingerprint, ShieldAlert,
  Server, Smartphone, HelpCircle, HardDriveDownload, Sparkles, LogIn
} from 'lucide-react';
import { PasswordEntry, UserSession, SecurityConfig } from './types';
import { 
  encryptData, decryptData, hashSHA256, calculatePasswordStrength, 
  generateSecurePassword, deriveKeyPBKDF2 
} from './utils/crypto';
import { verifyTOTP } from './utils/mfa';

// Components
import PasswordGenerator from './components/PasswordGenerator';
import BiometricModal from './components/BiometricModal';
import AuditPanel from './components/AuditPanel';
import MfaSetup from './components/MfaSetup';
import WipeSettings from './components/WipeSettings';

// NoppoAuth Global Config
const AUTH_URL = "https://noppo-auth.noppo5319.workers.dev";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2YXZhc3JkeGd1cWtpaWdjeGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTk5ODcsImV4cCI6MjA4Mjk5NTk4N30.CVq3lyRbxek7Ejs4tP5sN9-0JNEXSLtCsC2Pj-skFFQ";

export default function App() {
  // Authentication & Session States
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [offlineMasterPassword, setOfflineMasterPassword] = useState('');
  const [offlinePasswordConfirm, setOfflinePasswordConfirm] = useState('');
  
  // App Lock State
  const [isLocked, setIsLocked] = useState(true);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [unlockAttempts, setUnlockAttempts] = useState(0);
  const [unlockError, setUnlockError] = useState('');
  const [isWipingInProgress, setIsWipingInProgress] = useState(false);

  // Vault Passkey States
  const [hasSetPasskey, setHasSetPasskey] = useState(false);
  const [newPasskey, setNewPasskey] = useState('');
  const [newPasskeyConfirm, setNewPasskeyConfirm] = useState('');

  // Auto-detect passkey presence whenever session updates
  useEffect(() => {
    if (session) {
      const email = session.email || 'offline';
      
      // Check if user has explicit passkey marker set
      const passkeyConfig = localStorage.getItem(`noppo_has_set_passkey_${email}`);
      const savedDb = localStorage.getItem('noppo_password_db');
      
      // Also fallback lookup: if the encrypted DB exists and has passwords, they obviously set one already
      const hasDb = savedDb && JSON.parse(savedDb).length > 0;

      if (passkeyConfig === 'true' || hasDb) {
        setHasSetPasskey(true);
        if (passkeyConfig !== 'true') {
          localStorage.setItem(`noppo_has_set_passkey_${email}`, 'true');
        }
      } else {
        setHasSetPasskey(false);
      }
    } else {
      setHasSetPasskey(false);
    }
  }, [session]);

  // Ref for backup file inputs
  const backupFileInputRef = React.useRef<HTMLInputElement>(null);

  // Backup Export & Import (Resolves data loss when clearing history/cache)
  const handleExportBackup = () => {
    try {
      const backupData = {
        type: "noppopassword-backup",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        email: session?.email || 'offline',
        encryptedEntries: encryptedEntries,
        securityConfig: securityConfig
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = `NoppoPassword_Backup_${session?.email || 'offline'}_${new Date().toISOString().split('T')[0]}.noppo`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("バックアップのエクスポートに失敗しました。詳細: " + e);
    }
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (parsed.type !== "noppopassword-backup" || !Array.isArray(parsed.encryptedEntries)) {
          alert("無効なファイル形式です。NoppoPassword の正規のバックアップファイル(.noppo)を選択してください。");
          return;
        }

        // Restore back to LocalStorage
        localStorage.setItem('noppo_password_db', JSON.stringify(parsed.encryptedEntries));
        setEncryptedEntries(parsed.encryptedEntries);

        if (parsed.securityConfig) {
          localStorage.setItem('noppo_security_config', JSON.stringify(parsed.securityConfig));
          setSecurityConfig(parsed.securityConfig);
        }

        // Check if there was a saved session email we can restore to help them sign in
        if (parsed.email) {
          const mockSession: UserSession = parsed.email === 'offline-vault@noppopassword.local' || parsed.email === 'offline'
            ? {
                userId: "オフライン守護者",
                email: "offline-vault@noppopassword.local",
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=offline`,
                isMfaVerified: false,
                isOffline: true
              }
            : {
                userId: "Noppo開発者",
                email: parsed.email,
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${parsed.email}`,
                isMfaVerified: false,
                isOffline: false
              };
          setSession(mockSession);
          localStorage.setItem('noppo_active_session', JSON.stringify(mockSession));
        }

        alert("暗号バックアップデータの読み込みに成功しました！作成済みの「パスキー」を入力して、通常通り施錠された保管庫を解錠してください。");
        setIsLocked(true);
        // Reset file input value
        if (e.target) e.target.value = '';
      } catch (err) {
        alert("ファイルの解析中にエラーが発生しました。バックアップファイルが壊れている可能性があります。");
      }
    };
    reader.readAsText(file);
  };

  // Security & App Configuration (Stored Encrypted in localStorage)
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    mfaSecret: '',
    isMfaEnabled: false,
    mfaBackupCodes: [],
    failedAttemptsLimit: 5,
    silentWipeCodeEncrypted: '',
    isBiometricEnabled: false,
    biometricType: 'none',
    lastWipeAttemptCount: 0
  });

  // Database State (In-memory decrypted list, backing encrypted list)
  const [encryptedEntries, setEncryptedEntries] = useState<PasswordEntry[]>([]);
  const [decryptedEntries, setDecryptedEntries] = useState<PasswordEntry[]>([]);
  const [masterKey, setMasterKey] = useState(''); // Purely in-memory key derived during unlock

  // MFA Challenge State for login
  const [mfaChallengeCode, setMfaChallengeCode] = useState('');
  const [mfaChallengeError, setMfaChallengeError] = useState('');
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  const [pendingMasterKey, setPendingMasterKey] = useState('');

  // UI Navigation States
  const [activeTab, setActiveTab] = useState<'vault' | 'generator' | 'audit' | 'settings'>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeBiometricModal, setActiveBiometricModal] = useState<boolean>(false);

  // Password Entry Form / Drawer
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCategory, setFormCategory] = useState<PasswordEntry['category']>('web');
  const [formCopied, setFormCopied] = useState(false);

  // Utility Copy Feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null);

  // Recovery Key States
  const [showRecoverySetupModal, setShowRecoverySetupModal] = useState<boolean>(false);
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string>('');
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState<boolean>(false);

  // Recovery Input Unlock States
  const [showRecoveryUnlockForm, setShowRecoveryUnlockForm] = useState<boolean>(false);
  const [recoveryInput, setRecoveryInput] = useState<string>('');
  const [recoveryError, setRecoveryError] = useState<string>('');
  const [showPasskeyResetAfterRecovery, setShowPasskeyResetAfterRecovery] = useState<boolean>(false);
  const [resetPasskey, setResetPasskey] = useState<string>('');
  const [resetPasskeyConfirm, setResetPasskeyConfirm] = useState<string>('');

  // MFA Alphanumeric Backup Codes Skip Mode
  const [showMfaBackupInput, setShowMfaBackupInput] = useState<boolean>(false);
  const [mfaBackupInput, setMfaBackupInput] = useState<string>('');

  // -------------------------------------------------------------------------
  // Bootstrapping: Load config / Authenticate
  // -------------------------------------------------------------------------
  useEffect(() => {
    loadLocalConfigs();
    handleOAuthArrival();
  }, []);

  // Load configs from local storage
  const loadLocalConfigs = () => {
    try {
      // 1. Load security config if exists
      const savedConfig = localStorage.getItem('noppo_security_config');
      if (savedConfig) {
        setSecurityConfig(JSON.parse(savedConfig));
      }

      // 2. Load encrypted entry database
      const savedDb = localStorage.getItem('noppo_password_db');
      if (savedDb) {
        setEncryptedEntries(JSON.parse(savedDb));
      }

      // 3. Check for standalone/offline status
      const savedSession = localStorage.getItem('noppo_active_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        // Only recover offlines this way
        if (parsed.isOffline) {
          setSession(parsed);
          setIsLocked(true);
        }
      }
    } catch (e) {
      console.error('Error loading config:', e);
    }
  };

  // Step 1 & 2: NoppoAuth Single Sign-On Integration
  const handleOAuthArrival = async () => {
    setIsAuthChecking(true);
    const urlParams = new URLSearchParams(window.location.search);
    const ticket = urlParams.get('ticket');

    if (ticket) {
      try {
        const res = await fetch(`${AUTH_URL}/auth/v1/user?ticket=${ticket}`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const OAuthUser = await res.json();
          
          // Clear ticket from URL cleanly
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);

          // Prepare online session
          const onlineSession: UserSession = {
            userId: OAuthUser.userId || "Noppo開発者",
            email: OAuthUser.email || "noppodev@gmail.com",
            avatar: OAuthUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${OAuthUser.email || "noppo"}`,
            isMfaVerified: false,
            isOffline: false
          };

          // Save and handle downstream locks etc.
          setSession(onlineSession);
          localStorage.setItem('noppo_active_session', JSON.stringify(onlineSession));
          setIsLocked(true);
        }
      } catch (e) {
        console.error("SSO Authentication Error:", e);
      }
    } else {
      // If already logged in on session storage / local storage
      const savedSession = localStorage.getItem('noppo_active_session');
      if (savedSession) {
        const parsed: UserSession = JSON.parse(savedSession);
        setSession(parsed);
        setIsLocked(true);
      }
    }
    setIsAuthChecking(false);
  };

  // Step 1: Login redirect trigger
  const triggerSSOLogin = () => {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `${AUTH_URL}?redirect=${currentUrl}`;
  };

  // Step 3: Logout session safely
  const triggerSSOLogout = () => {
    localStorage.removeItem('noppo_active_session');
    setSession(null);
    setMasterKey('');
    setDecryptedEntries([]);
    setIsLocked(true);

    if (session && !session.isOffline) {
      const homeUrl = encodeURIComponent(window.location.origin);
      window.location.href = `${AUTH_URL}/logout?redirect=${homeUrl}`;
    }
  };

  // -------------------------------------------------------------------------
  // Offline Mode Switch Flow
  // -------------------------------------------------------------------------
  const handleSetupOfflineMode = (e: React.FormEvent) => {
    e.preventDefault();
    if (offlineMasterPassword.length < 8) {
      alert('パスキーは8文字以上に設定してください。');
      return;
    }
    if (offlineMasterPassword !== offlinePasswordConfirm) {
      alert('再入力されたパスキーが一致しません。');
      return;
    }

    const salt = "offline-vault@noppopassword.local";
    // Derived master encryption key offline
    const generatedKey = deriveKeyPBKDF2(offlineMasterPassword, salt);
    setMasterKey(generatedKey);

    const offlineUser: UserSession = {
      userId: "オフライン守護者",
      email: "offline-vault@noppopassword.local",
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=offline`,
      isMfaVerified: false,
      isOffline: true
    };

    setSession(offlineUser);
    localStorage.setItem('noppo_active_session', JSON.stringify(offlineUser));
    
    // Mark as has set passkey for offline
    localStorage.setItem('noppo_has_set_passkey_offline-vault@noppopassword.local', 'true');
    setHasSetPasskey(true);

    // Save initial placeholder encryption verification hash into security configs
    const newConfig: SecurityConfig = {
      ...securityConfig,
      silentWipeCodeEncrypted: hashSHA256("wipe-me-silent-123") // placeholder
    };
    saveConfig(newConfig);
    
    // Auto unlock on initialization
    setDecryptedEntries([]);
    setIsLocked(false);
  };

  // -------------------------------------------------------------------------
  // Online New Registration Passkey Creation Setup
  // -------------------------------------------------------------------------
  const handleCreatePasskey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    if (newPasskey.length < 8) {
      alert('保管庫パスキーは8文字以上に設定してください。');
      return;
    }
    if (newPasskey !== newPasskeyConfirm) {
      alert('再入力されたパスキーが異なります。');
      return;
    }

    // Stretch and derive Key
    const salt = session.email || "noppodev@gmail.com";
    const derivedKey = deriveKeyPBKDF2(newPasskey, salt);
    setMasterKey(derivedKey);

    const email = session.email || 'offline';
    // Register that this email has set a passkey
    localStorage.setItem(`noppo_has_set_passkey_${email}`, 'true');
    setHasSetPasskey(true);

    // Empty database initialized
    saveEncryptedDb([]);
    setIsLocked(false);
    setUnlockError('');
    setNewPasskey('');
    setNewPasskeyConfirm('');
    alert('暗号保管庫の解錠パスキーを設定し、正常に解錠しました。次回からはデバイス認証でスムーズにログインできます。');
  };

  // -------------------------------------------------------------------------
  // Encryption Database & Decryption Unlocks (AES-256 Guarantee)
  // -------------------------------------------------------------------------

  // Save changes back to encrypted database
  const saveEncryptedDb = (entriesList: PasswordEntry[]) => {
    setEncryptedEntries(entriesList);
    localStorage.setItem('noppo_password_db', JSON.stringify(entriesList));
  };

  // Decrypt everything into memory using derived masterKey
  const performDecryption = (key: string, customEntries?: PasswordEntry[]): boolean => {
    try {
      const activeEntries = customEntries !== undefined ? customEntries : encryptedEntries;
      if (activeEntries.length === 0) {
        setDecryptedEntries([]);
        return true; // nothing to decrypt
      }

      const results: PasswordEntry[] = [];
      for (const entry of activeEntries) {
        const decryptedPass = decryptData(entry.passwordEncrypted, key);
        if (entry.passwordEncrypted && !decryptedPass) {
          // Failure to decrypt a single active password points to incorrect key
          return false;
        }
        
        const decryptedNotes = entry.notesEncrypted 
          ? decryptData(entry.notesEncrypted, key) 
          : '';

        results.push({
          ...entry,
          // Store decrypted raw password and notes temporary only in local state variable
          passwordEncrypted: decryptedPass, 
          notesEncrypted: decryptedNotes
        });
      }

      setDecryptedEntries(results);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // Triggered master-key unlock
  const handleUnlockWithKey = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!masterKeyInput) {
      setUnlockError('保管庫パスキーを入力してください。');
      return;
    }

    // 1. Check for Silent Self-Destruct Code Activation
    if (securityConfig.silentWipeCodeEncrypted) {
      const inputHash = hashSHA256(masterKeyInput);
      if (inputHash === securityConfig.silentWipeCodeEncrypted) {
        // MATCHED SILENT CODE! Force trigger wipe instantly
        handleWipeEntireDataSilent();
        return;
      }
    }

    // 2. Perform PBKDF2 hash stretching to get the encryption key
    const salt = session?.email || "noppodev@gmail.com";
    const derivedKey = deriveKeyPBKDF2(masterKeyInput, salt);

    // 3. Attempt decryption mapping
    const success = performDecryption(derivedKey);

    if (success) {
      // Check MFA first
      if (securityConfig.isMfaEnabled && securityConfig.mfaSecret && (!session || !session.isMfaVerified)) {
        setPendingMasterKey(derivedKey);
        setShowMfaChallenge(true);
        setUnlockError('');
      } else {
        // Unlock granted
        setMasterKey(derivedKey);
        setIsLocked(false);
        setUnlockAttempts(0);
        setUnlockError('');
      }

      setMasterKeyInput('');
    } else {
      // Lock increment and automatic data wiping enforcement
      const nextAttempts = unlockAttempts + 1;
      setUnlockAttempts(nextAttempts);

      if (nextAttempts >= securityConfig.failedAttemptsLimit) {
        handleWipeEntireDataDueToFailure();
      } else {
        setUnlockError(`パスキーが一致しません。残り ${securityConfig.failedAttemptsLimit - nextAttempts} 回の試行で自動ワイプされます。`);
      }
    }
  };

  // WebAuthn Simulation unlocks
  // WebAuthn/Biometrics secure unlock handler (decrypted master key restore)
  const handleBiometricUnlockSuccess = (credentialId?: string, rawId?: string, isFallback?: boolean) => {
    if (!securityConfig.biometricWrappedKey) {
      setUnlockError('保管庫の生体認証紐づけデータが見つかりません。通常のパスキーで一度ログイン後、設定から生体認証を再登録してください。');
      setActiveBiometricModal(false);
      return;
    }

    try {
      let derivedKey = '';
      const salt = session?.email || "noppodev@gmail.com";

      if (isFallback) {
        // Fallback decryption using predefined local seed
        const wrappingKey = hashSHA256("NoppoPass-BiometricsSession-2026" + salt);
        derivedKey = decryptData(securityConfig.biometricWrappedKey, wrappingKey);
      } else if (rawId) {
        // Real WebAuthn decryption using rawId
        const wrappingKey = hashSHA256(rawId + salt);
        derivedKey = decryptData(securityConfig.biometricWrappedKey, wrappingKey);
      }

      if (!derivedKey) {
        setUnlockError('生体認証アサーションによるマスターキーの復元（デラップ）に失敗しました。マスターパスワードでログインしてください。');
        setActiveBiometricModal(false);
        return;
      }

      // Attempt decrypting database with restored masterKey
      const success = performDecryption(derivedKey);

      if (success) {
        if (securityConfig.isMfaEnabled && securityConfig.mfaSecret && (!session || !session.isMfaVerified)) {
          setPendingMasterKey(derivedKey);
          setShowMfaChallenge(true);
          setUnlockError('');
        } else {
          setMasterKey(derivedKey);
          setIsLocked(false);
          setUnlockAttempts(0);
          setUnlockError('');
        }
      } else {
        setUnlockError('生体認証連携により復元されたキーが現在の保管庫情報と不一致です。再度通常のパスキーによる認証を行ってください。');
      }
    } catch (e) {
      console.error('Biometric decryption derivation error:', e);
      setUnlockError('生体認証解錠の手続き中に例外エラーが発生しました。');
    }

    setActiveBiometricModal(false);
  };

  // -------------------------------------------------------------------------
  // Mfa / Setup Validation
  // -------------------------------------------------------------------------
  const handleVerifyMfaChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    setMfaChallengeError('');

    if (showMfaBackupInput) {
      const cleanBackupCode = mfaBackupInput.toUpperCase().trim();
      if (!cleanBackupCode) {
        setMfaChallengeError('MFA緊急スキップコードを入力してください。');
        return;
      }
      
      const matchedBackupIdx = securityConfig.mfaBackupCodes.indexOf(cleanBackupCode);
      if (matchedBackupIdx !== -1) {
        // Consume backup code
        const updatedCodes = [...securityConfig.mfaBackupCodes];
        updatedCodes.splice(matchedBackupIdx, 1);
        
        const nextConfig = { ...securityConfig, mfaBackupCodes: updatedCodes };
        saveConfig(nextConfig);

        setShowMfaChallenge(false);
        setShowMfaBackupInput(false);
        
        const updatedSession = session ? { ...session, isMfaVerified: true } : null;
        setSession(updatedSession);
        if (updatedSession) {
          localStorage.setItem('noppo_active_session', JSON.stringify(updatedSession));
        }

        if (pendingMasterKey) {
          setMasterKey(pendingMasterKey);
          setPendingMasterKey('');
          setIsLocked(false);
        }
        setMfaChallengeCode('');
        setMfaBackupInput('');
        alert('MFA緊急スキップコードが承認されました。該当コードは一度限りのため破棄されました。');
      } else {
        setMfaChallengeError('入力されたスキップコードが無効、または既に使用されています。');
      }
      return;
    }

    if (mfaChallengeCode.length !== 6) {
      setMfaChallengeError('6桁すべて入力してください。');
      return;
    }

    const valid = verifyTOTP(securityConfig.mfaSecret, mfaChallengeCode);
    if (valid) {
      // Passed extra OTP authentication layer
      setShowMfaChallenge(false);
      
      const updatedSession = session ? { ...session, isMfaVerified: true } : null;
      setSession(updatedSession);
      if (updatedSession) {
        localStorage.setItem('noppo_active_session', JSON.stringify(updatedSession));
      }

      if (pendingMasterKey) {
        setMasterKey(pendingMasterKey);
        setPendingMasterKey('');
        setIsLocked(false);
      }
      setMfaChallengeCode('');
    } else {
      setMfaChallengeError('ワンタイムパスコードが一致いたしません。');
    }
  };

  // Save settings helper
  const saveConfig = (newConfig: SecurityConfig) => {
    setSecurityConfig(newConfig);
    localStorage.setItem('noppo_security_config', JSON.stringify(newConfig));
  };

  // -------------------------------------------------------------------------
  // Self defense automatic data wipers
  // -------------------------------------------------------------------------
  
  // Wipe due to failed lock attempts limit
  const handleWipeEntireDataDueToFailure = () => {
    setIsWipingInProgress(true);
    setTimeout(() => {
      // Flush database
      localStorage.removeItem('noppo_password_db');
      localStorage.removeItem('noppo_active_session');
      localStorage.removeItem('noppo_security_config');
      
      setEncryptedEntries([]);
      setDecryptedEntries([]);
      setSession(null);
      setMasterKey('');
      setIsLocked(true);
      setUnlockAttempts(0);
      setUnlockError('連続認証失敗の上限に達したため、緊急セルフデストラクト（自動データワイプ）が作動し、保管庫の中身を完全抹消いたしました。');
      setIsWipingInProgress(false);
    }, 2000);
  };

  // Wipe triggered by silent code
  const handleWipeEntireDataSilent = () => {
    setIsWipingInProgress(true);
    // Simulate natural looking authorization latency to mask wipe action
    setTimeout(() => {
      localStorage.removeItem('noppo_password_db');
      localStorage.removeItem('noppo_active_session');
      localStorage.removeItem('noppo_security_config');
      
      setEncryptedEntries([]);
      setDecryptedEntries([]);
      setSession(null);
      setMasterKey('');
      setIsLocked(true);
      setUnlockAttempts(0);
      setUnlockError('サイレント自己消滅コードが実行されました。デバイス内のすべてのデータは跡形もなく完全物理消去されました。');
      setIsWipingInProgress(false);
    }, 1500);
  };

  // Manual Trigger Full Wipe
  const handleWipeEntireDataManual = () => {
    localStorage.clear();
    setEncryptedEntries([]);
    setDecryptedEntries([]);
    setSession(null);
    setMasterKey('');
    setIsLocked(true);
    setUnlockAttempts(0);
    setUnlockError('保管庫内のすべての暗号化データは永久に完全抹消されました。');
  };

  // -------------------------------------------------------------------------
  // Cryptographic Vault Recovery (Backup Key) Flows
  // -------------------------------------------------------------------------
  const handleGenerateRecoveryKey = () => {
    if (!masterKey) {
      alert('保管庫が解錠されていないか、マスターキーがメモリにありません。');
      return;
    }

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing user-characters
    const segments = [];
    for (let i = 0; i < 4; i++) {
      let block = '';
      for (let j = 0; j < 4; j++) {
        block += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      segments.push(block);
    }
    const phrase = `RECOVERY-${segments.join('-')}`;
    const salt = session?.email || "noppodev@gmail.com";
    const wrappingKey = hashSHA256(phrase + salt);
    const wrapped = encryptData(masterKey, wrappingKey);
    const phraseHash = hashSHA256(phrase);

    if (!wrapped) {
      alert('リカバリーキーの暗号化に失敗しました。');
      return;
    }

    const updatedConfig: SecurityConfig = {
      ...securityConfig,
      recoveryKeyWrappedMasterKey: wrapped,
      recoveryKeyHash: phraseHash
    };

    saveConfig(updatedConfig);
    setGeneratedRecoveryKey(phrase);
    setCopiedRecoveryKey(false);
    setShowRecoverySetupModal(true);
  };

  const handleUnlockWithRecoveryKey = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');

    if (!recoveryInput.trim()) {
      setRecoveryError('復旧用バックアップキーを入力してください。');
      return;
    }

    const cleanedKey = recoveryInput.trim().toUpperCase();
    
    if (!cleanedKey.startsWith('RECOVERY-')) {
      setRecoveryError('キー形式が正しくありません。「RECOVERY-」で記載されたコードを入力してください。');
      return;
    }

    const salt = session?.email || "noppodev@gmail.com";
    const wrappingKey = hashSHA256(cleanedKey + salt);

    if (!securityConfig.recoveryKeyWrappedMasterKey) {
      setRecoveryError('登録済みの復旧暗号データが見つかりません。あらかじめ設定画面からキーを生成しておく必要があります。');
      return;
    }

    try {
      const decryptedMasterKey = decryptData(securityConfig.recoveryKeyWrappedMasterKey, wrappingKey);
      
      if (!decryptedMasterKey) {
        setRecoveryError('バックアップキーが一致しないか、検証に失敗しました。');
        return;
      }

      // Try decrypting the DB
      const success = performDecryption(decryptedMasterKey);

      if (success) {
        setMasterKey(decryptedMasterKey);
        setIsLocked(false);
        setUnlockAttempts(0);
        setUnlockError('');
        setRecoveryInput('');
        setRecoveryError('');
        setShowRecoveryUnlockForm(false);
        
        // Open the reset form to enforce reset of lock passkey immediately
        setShowPasskeyResetAfterRecovery(true);
      } else {
        setRecoveryError('復元キーは正しいですが、現在の暗号データベースと整合しません。');
      }
    } catch (err) {
      console.error(err);
      setRecoveryError('暗号デコード中に致命的なエラーが発生しました。');
    }
  };

  const handleResetPasskeyWithRestoredKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterKey) {
      alert('保管庫が解錠されていません。');
      return;
    }
    if (resetPasskey.length < 8) {
      alert('新しい解錠パスキーは8文字以上に設定してください。');
      return;
    }
    if (resetPasskey !== resetPasskeyConfirm) {
      alert('確認用の再入力パスキーが一致しません。');
      return;
    }

    const salt = session?.email || "noppodev@gmail.com";
    const newDerivedKey = deriveKeyPBKDF2(resetPasskey, salt);

    try {
      const newlyEncryptedList = decryptedEntries.map(entry => {
        const encryptedPw = encryptData(entry.passwordEncrypted, newDerivedKey);
        const encryptedNotes = entry.notesEncrypted ? encryptData(entry.notesEncrypted, newDerivedKey) : '';
        return {
          ...entry,
          passwordEncrypted: encryptedPw,
          notesEncrypted: encryptedNotes || undefined,
          updatedAt: new Date().toISOString()
        };
      });

      saveEncryptedDb(newlyEncryptedList);
      setMasterKey(newDerivedKey);
      
      // Restructure biometric setting
      if (securityConfig.isBiometricEnabled && securityConfig.isBiometricFallback) {
        const fallbackWrappingKey = hashSHA256("NoppoPass-BiometricsSession-2026" + salt);
        const wrappedBiometric = encryptData(newDerivedKey, fallbackWrappingKey);
        const nextConfig = { ...securityConfig, biometricWrappedKey: wrappedBiometric };
        saveConfig(nextConfig);
      } else if (securityConfig.isBiometricEnabled && securityConfig.biometricCredentialId) {
        const nextConfig = {
          ...securityConfig,
          isBiometricEnabled: false,
          biometricType: 'none' as any,
          biometricWrappedKey: undefined,
          biometricCredentialId: undefined,
          isBiometricFallback: undefined
        };
        saveConfig(nextConfig);
        alert('マスターパスキー変更のため、セキュア生体認証の設定が初期化されました。再度ご登録ください。');
      }

      // Reset recovery wrapped key until generated again with new masterKey
      const nextConfig = {
        ...securityConfig,
        recoveryKeyWrappedMasterKey: undefined,
        recoveryKeyHash: undefined
      };
      saveConfig(nextConfig);

      setShowPasskeyResetAfterRecovery(false);
      setResetPasskey('');
      setResetPasskeyConfirm('');
      alert('保管庫解錠パスキーの再設定が完了しました！セキュリティ確保のため、必要に応じて新たな復旧用バックアップキーを再生成してください。');
      
      performDecryption(newDerivedKey, newlyEncryptedList);
    } catch (err) {
      console.error(err);
      alert('データの再暗号化処理中にエラーが発生しました。');
    }
  };

  // -------------------------------------------------------------------------
  // Password Vault CRUD Core Interactions
  // -------------------------------------------------------------------------
  const handleOpenAddForm = () => {
    setEditingEntry(null);
    setFormTitle('');
    setFormUsername('');
    setFormPassword(generateSecurePassword(16)); // auto fill with recommended strong password
    setFormUrl('');
    setFormNotes('');
    setFormCategory('web');
    setIsEntryFormOpen(true);
  };

  const handleOpenEditForm = (entry: PasswordEntry) => {
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormUsername(entry.username);
    // These values are already the decrypted in-memory variables when accessed in main page view list
    setFormPassword(entry.passwordEncrypted);
    setFormUrl(entry.url || '');
    setFormNotes(entry.notesEncrypted || '');
    setFormCategory(entry.category);
    setIsEntryFormOpen(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formUsername || !formPassword) {
      alert('タイトル、ユーザー名、ログイン暗証番号は必須入力です。');
      return;
    }

    // Determine strength rating
    const strengthResult = calculatePasswordStrength(formPassword);

    // Form data to encrypt
    const encryptedPw = encryptData(formPassword, masterKey);
    const encryptedNote = formNotes ? encryptData(formNotes, masterKey) : '';

    const nowStr = new Date().toISOString();

    let updatedList: PasswordEntry[] = [];
    if (editingEntry) {
      // EDIT MODE
      updatedList = encryptedEntries.map(e => {
        if (e.id === editingEntry.id) {
          return {
            ...e,
            title: formTitle,
            username: formUsername,
            passwordEncrypted: encryptedPw,
            url: formUrl || undefined,
            notesEncrypted: encryptedNote || undefined,
            category: formCategory,
            strengthScore: strengthResult.score,
            updatedAt: nowStr
          };
        }
        return e;
      });
    } else {
      // ADD MODE
      const newEntry: PasswordEntry = {
        id: `pw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: formTitle,
        username: formUsername,
        passwordEncrypted: encryptedPw,
        url: formUrl || undefined,
        notesEncrypted: encryptedNote || undefined,
        category: formCategory,
        strengthScore: strengthResult.score,
        createdAt: nowStr,
        updatedAt: nowStr
      };
      updatedList = [newEntry, ...encryptedEntries];
    }

    saveEncryptedDb(updatedList);
    // Reload active decrypted viewer with memory-decrypted copy immediately
    performDecryption(masterKey, updatedList);

    setIsEntryFormOpen(false);
    setEditingEntry(null);
  };

  const handleDeleteEntry = (id: string) => {
    if (window.confirm('この暗号化エントリーを削除しますか？この作業は取り消せません。')) {
      const filtered = encryptedEntries.filter(e => e.id !== id);
      saveEncryptedDb(filtered);
      performDecryption(masterKey, filtered);
    }
  };

  // Helper utility copy commands
  const copyValueToClipboard = async (text: string, id: string) => {
    try {
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Auto fill generated password inside add form
  const applyGeneratedPasswordToForm = (pw: string) => {
    setFormPassword(pw);
  };

  // Filter lists for real-time search and categories
  const filteredEntries = useMemo(() => {
    return decryptedEntries.filter(entry => {
      const matchSearch = 
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (entry.username && entry.username.toLowerCase().includes(searchQuery.toLowerCase())) || 
        (entry.url && entry.url.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchCategory = selectedCategory === 'all' || entry.category === selectedCategory;
      
      return matchSearch && matchCategory;
    });
  }, [decryptedEntries, searchQuery, selectedCategory]);

  return (
    <div id="noppopassword-app-frame" className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Hidden file input for encrypted backup restore */}
      <input
        type="file"
        ref={backupFileInputRef}
        onChange={handleImportBackupFile}
        accept=".noppo,.json"
        className="hidden"
      />

      {/* --------------------------------------------------------------------- */}
      {/* 1. Global Loading Check */}
      {/* --------------------------------------------------------------------- */}
      {isAuthChecking && (
        <div id="loading" className="flex-1 flex flex-col items-center justify-center min-h-screen gap-3 bg-[#f8f9ff]">
          <RefreshCw className="h-10 w-10 text-blue-600 animate-spin" />
          <p className="text-xs text-slate-500 font-mono tracking-wider">SECURE AUTH_VERIFYING...</p>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. SILENT WIPE INTERCEPTOR SCREEN */}
      {/* --------------------------------------------------------------------- */}
      {isWipingInProgress && (
        <div id="silent-wiper" className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-6">
            <Shield className="h-16 w-16 text-red-500 animate-pulse" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono text-red-600">RESET</span>
          </div>
          <h2 className="text-xl font-bold tracking-wider font-sans text-slate-800">マスターキーを検証中...</h2>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            SYS_ENCRYPT_DECRYPT_LOCK: OK. STORAGE_FLUSHING...
          </p>
        </div>
      )}

      {!isAuthChecking && !isWipingInProgress && (
        <>
          {/* ----------------------------------------------------------------- */}
          {/* 3. LOGIN PAGE (Single entry view when not authenticated) */}
          {/* ----------------------------------------------------------------- */}
          {!session ? (
            <div id="unauthenticated-onboarding-view" className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-blue-50/10 via-white to-blue-50/20">
              <div className="w-full max-w-md bg-white border border-blue-100 rounded-3xl p-8 relative overflow-hidden beveled-edge ambient-shadow">
                
                {/* Visual highlights with subtle refraction glow */}
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-cyan-100/30 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-100/30 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col items-center text-center space-y-3 relative z-10">
                  <div className="bg-blue-50 p-4 rounded-full border border-blue-100 text-blue-600">
                    <Shield className="h-10 w-10 drop-shadow-[0_0_8px_rgba(37,99,235,0.25)] animate-pulse" />
                  </div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
                    NoppoPassword
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full">
                    AES-256 ZERO_KNOWLEDGE
                  </span>
                  <p className="text-xs text-slate-500 px-4 leading-relaxed font-normal">
                    世界水準のAES-256暗号化に対応した、純日本製・極堅牢パスワード管理アプリ。キャッシュ消去に備えた、手動での安全ファイルエクスポートも標準サポート。
                  </p>
                </div>

                {/* Local alert or failure error display */}
                {unlockError && (
                  <div className="mt-6 p-3 bg-red-50 border border-red-100 text-[11px] text-red-600 rounded-xl flex items-start gap-2 animate-fadeIn leading-relaxed relative z-10">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{unlockError}</span>
                  </div>
                )}

                {/* SSO vs Offline selector */}
                <div className="mt-8 space-y-4 relative z-10">
                  {/* Google SSO Authentical login (NoppoAuth) */}
                  <button
                    onClick={triggerSSOLogin}
                    className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white font-semibold rounded-2xl py-3 px-4 text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/15"
                  >
                    <LogIn className="h-4 w-4" />
                    NoppoAuth を利用してサインイン
                  </button>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-[9px] text-slate-400 uppercase font-mono tracking-widest select-none">OR SECURE OFFLINE</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  {/* Offline Initialization Setup Panel */}
                  <form onSubmit={handleSetupOfflineMode} className="space-y-3">
                    <p className="text-[10px] text-slate-500 text-center leading-normal">
                      または、NoppoAuthを使用しないローカル専用オフライン保管室を作ります：
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 border border-slate-100 bg-slate-50 px-3 py-2 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                        <Key className="h-4 w-4 text-slate-400" />
                        <input
                          type="password"
                          required
                          placeholder="マスターパスワードを設定"
                          value={offlineMasterPassword}
                          onChange={(e) => setOfflineMasterPassword(e.target.value)}
                          className="bg-transparent border-none text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none w-full font-sans"
                        />
                      </div>
                      <div className="flex items-center gap-2 border border-slate-100 bg-slate-50 px-3 py-2 rounded-xl focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                        <KeyRound className="h-4 w-4 text-slate-400" />
                        <input
                          type="password"
                          required
                          placeholder="マスターパスワードの再入力"
                          value={offlinePasswordConfirm}
                          onChange={(e) => setOfflinePasswordConfirm(e.target.value)}
                          className="bg-transparent border-none text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none w-full font-sans"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 border border-slate-200 text-slate-700 font-semibold rounded-2xl py-2.5 px-4 text-xs transition flex items-center justify-center gap-2"
                    >
                      <Smartphone className="h-4 w-4 text-slate-500" />
                      完全オフライン専用保管庫を構築
                    </button>
                    <span className="text-[9px] text-slate-400 block text-center leading-normal">
                      ※この端末内(Local Storage)の暗号キーでのみ復号可能。完全に閉じたサンドボックス環境です。
                    </span>
                  </form>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-[9px] text-slate-400 uppercase font-mono tracking-widest select-none">OR RECLAIM VAULT</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  {/* RESTORE FROM BACKUP IN LOGIN */}
                  <div className="bg-blue-50/30 p-4 border border-blue-50/80 rounded-2xl text-center space-y-2.5">
                    <p className="text-[10px] text-slate-500 leading-normal">
                      ブラウザの履歴削除などで鍵や保管庫データが消えてしまった場合は、エクスポート済みのバックアップファイル(.noppo)から即座にデータを復旧できます：
                    </p>
                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      className="w-full bg-[#0040e0] hover:bg-[#2e5bff] text-white font-bold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/10 cursor-pointer"
                    >
                      <HardDriveDownload className="h-3.5 w-3.5" />
                      バックアップから保管庫を取り込む
                    </button>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------------------- */}
              {/* 4. UNLOCK LOCK SCREEN (Requires derived master password key) */}
              {/* ------------------------------------------------------------- */}
              {isLocked ? (
                <div id="locked-vault-screen" className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-blue-50/10 via-white to-blue-50/20">
                  {showMfaChallenge ? (
                    /* 4A. INTERCEPTING MFA CHALLENGE SCREEN (MFA Required for access) */
                    <div className="w-full max-w-sm bg-white border border-blue-100 rounded-3xl p-8 beveled-edge ambient-shadow space-y-6">
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className="bg-blue-50 p-4 rounded-full border border-blue-100 text-blue-600">
                          <Smartphone className="h-8 w-8 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 font-sans">NoppoPassword 専用二要素認証</h2>
                        <p className="text-xs text-slate-500 leading-relaxed px-2">
                          お使いの認証マネージャーアプリに表示されている 6 桁のワンタイム確認コードを入力してください。
                        </p>
                      </div>

                      {showMfaBackupInput ? (
                        <form onSubmit={handleVerifyMfaChallenge} className="space-y-4 animate-fadeIn">
                          <p className="text-[10px] text-center text-slate-500 leading-normal">
                            二要素認証（MFA）をスキップするための緊急コード（XXXX-XXXX）を入力してください。各コードは1回限り有効です。
                          </p>
                          <div className="space-y-1 text-left">
                            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                              MFA緊急スキップコード
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="XXXX-XXXX"
                              value={mfaBackupInput}
                              onChange={(e) => setMfaBackupInput(e.target.value)}
                              className="w-full text-center font-mono text-sm py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 uppercase focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition"
                            />
                            {mfaChallengeError && (
                              <p className="text-[10.5px] text-red-600 text-center font-medium mt-1">
                                {mfaChallengeError}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                              スキップコードを適用
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowMfaBackupInput(false);
                                setMfaBackupInput('');
                                setMfaChallengeError('');
                              }}
                              className="w-1/3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                            >
                              戻る
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyMfaChallenge} className="space-y-4">
                          <div className="text-center">
                            <input
                              type="text"
                              maxLength={6}
                              required
                              placeholder="000000"
                              value={mfaChallengeCode}
                              onChange={(e) => setMfaChallengeCode(e.target.value.replace(/\D/g, ''))}
                              className="w-40 text-center font-mono text-xl tracking-[10px] pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition"
                            />
                          </div>

                          {mfaChallengeError && (
                            <p className="text-[11px] text-red-600 text-center font-medium">
                              {mfaChallengeError}
                            </p>
                          )}

                          <button
                            type="submit"
                            className="w-full bg-[#0040e0] hover:bg-[#2e5bff] hover:shadow-lg hover:shadow-blue-600/10 py-3 rounded-xl text-xs font-semibold text-white transition cursor-pointer"
                          >
                            コードを送信して認証を完了
                          </button>

                          {securityConfig.mfaBackupCodes && securityConfig.mfaBackupCodes.length > 0 && (
                            <div className="text-center pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMfaBackupInput(true);
                                  setMfaChallengeError('');
                                }}
                                className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-bold transition cursor-pointer"
                              >
                                認証アプリを確認できませんか？（緊急スキップコードを使用）
                              </button>
                            </div>
                          )}
                        </form>
                      )}

                      <div className="text-center pt-2 border-t border-slate-100">
                        <button
                          onClick={triggerSSOLogout}
                          className="text-xs text-slate-500 hover:text-slate-800 transition flex items-center gap-1 mx-auto font-medium"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          認証中断（ログアウト）
                        </button>
                      </div>
                    </div>
                  ) : !hasSetPasskey ? (
                    /* 4C. INITIAL PASSKEY REGISTRATION SETUP PANEL FOR NEW USERS */
                    <div id="create-first-passkey-card" className="w-full max-w-md bg-white border border-blue-100 rounded-3xl p-8 beveled-edge ambient-shadow space-y-6 text-center">
                      <div className="flex flex-col items-center space-y-2">
                        <div className="bg-blue-50 p-4 rounded-full border border-blue-100 text-blue-600">
                          <KeyRound className="h-8 w-8 drop-shadow-[0_0_8px_rgba(37,99,235,0.2)] animate-pulse text-blue-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-950 tracking-tight font-sans">保管庫パスキーの初期設定</h2>
                        <p className="text-xs text-slate-500 leading-relaxed px-2">
                          {session.isOffline ? 'オフライン保管庫へようこそ！' : `${session.userId} 様、サインインに成功しました！`}<br />
                          安全なAES-256暗号化処理を行うため、この保管庫を保護するあなただけの「暗号パスキー(Passkey)」を新規作成してください。
                        </p>
                      </div>

                      <form onSubmit={handleCreatePasskey} className="space-y-4 text-left">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">解錠用パスキー（8文字以上）</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                              <input
                                type="password"
                                required
                                placeholder="強力なパスキーを設定"
                                value={newPasskey}
                                onChange={(e) => setNewPasskey(e.target.value)}
                                className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full pl-2 font-sans"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">パスキーの再入力確認</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                              <Check className="h-4 w-4 text-slate-400 shrink-0" />
                              <input
                                type="password"
                                required
                                placeholder="確認のためもう一度入力"
                                value={newPasskeyConfirm}
                                onChange={(e) => setNewPasskeyConfirm(e.target.value)}
                                className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full pl-2 font-sans"
                              />
                            </div>
                          </div>


                        </div>

                        <button
                          type="submit"
                          className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 py-3 rounded-xl text-xs font-bold text-white transition mt-2 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10 cursor-pointer"
                        >
                          <Unlock className="h-4 w-4" />
                          パスキーを作成して保管庫を解錠
                        </button>
                      </form>

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          <Server className="h-3 w-3 text-slate-400" />
                          {session.isOffline ? 'OFFLINE_MODE' : 'ONLINE_SSO'}
                        </div>
                        <button
                          onClick={triggerSSOLogout}
                          className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold transition flex items-center gap-1"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          ログアウト
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 4B. Vault Decryption Key MasterUnlock Prompt */
                    <div id="passkey-unlock-card" className="w-full max-w-sm bg-white border border-blue-100 rounded-3xl p-8 beveled-edge ambient-shadow text-center space-y-6">
                      <div className="flex flex-col items-center space-y-2">
                        <div className="bg-blue-50 p-4 rounded-full border border-blue-100 text-blue-600">
                          <KeyRound className="h-8 w-8 text-blue-600 animate-pulse" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 font-sans">暗号保管庫がロックされています</h2>
                        <p className="text-xs text-slate-500 leading-normal">
                          {session.isOffline ? '完全オフライン保管庫' : `${session.userId} 様のセキュア保管庫`}
                        </p>
                      </div>

                      {unlockError && (
                        <div className="p-3 bg-red-50 border border-red-100 text-[10px] text-red-600 rounded-xl leading-normal text-left">
                          {unlockError}
                        </div>
                      )}

                      {/* 生体認証（デバイス認証・WebAuthn）が有効な場合、最優先で大きく表示 */}
                      {securityConfig.isBiometricEnabled ? (
                        <div className="p-5 bg-blue-50/50 border border-blue-100/50 rounded-2xl text-center space-y-3.5 animate-fadeIn">
                          <p className="text-xs text-slate-600 font-medium leading-relaxed">
                            登録済みの生体認証でスマートに安全解錠が可能です。
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveBiometricModal(true)}
                            className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/15 cursor-pointer"
                          >
                            <Fingerprint className="h-5 w-5 text-white animate-pulse" />
                            生体認証で保管室を解錠
                          </button>
                        </div>
                      ) : null}

                      {showRecoveryUnlockForm ? (
                        <form onSubmit={handleUnlockWithRecoveryKey} className="space-y-4 animate-fadeIn">
                          <p className="text-[10px] text-center text-slate-500 leading-normal mb-1">
                            保管庫の設定画面で生成した「保管庫暗号復元キー（23桁のコード）」を正確に入力してください。
                          </p>
                          <div className="space-y-1 text-left">
                            <label className="text-[10.5px] uppercase font-bold tracking-wider text-slate-500">
                              保管庫暗号復元キーの入力
                            </label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                              <Key className="h-4 w-4 text-slate-400 shrink-0" />
                              <input
                                type="text"
                                required
                                placeholder="RECOVERY-XXXX-XXXX-XXXX-XXXX"
                                value={recoveryInput}
                                onChange={(e) => setRecoveryInput(e.target.value)}
                                className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full pl-2 font-mono uppercase placeholder:text-slate-400"
                              />
                            </div>
                            {recoveryError && (
                              <p className="text-[10px] text-red-500 font-bold pl-1 mt-1">{recoveryError}</p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/15 transition cursor-pointer"
                            >
                              保管庫の暗号復元を実行
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowRecoveryUnlockForm(false);
                                setRecoveryInput('');
                                setRecoveryError('');
                              }}
                              className="w-1/3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                            >
                              キャンセル
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <form onSubmit={handleUnlockWithKey} className="space-y-4">
                            <div className="space-y-1 text-left">
                              <label className="text-[10.5px] uppercase font-bold tracking-wider text-slate-500">
                                {securityConfig.isBiometricEnabled ? 'または手動でパスキーを入力' : '保管庫解錠パスキーの入力'}
                              </label>
                              <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
                                <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                                <input
                                  type="password"
                                  required
                                  placeholder="パスキーを入力して解錠"
                                  value={masterKeyInput}
                                  onChange={(e) => setMasterKeyInput(e.target.value)}
                                  className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full pl-2 font-sans placeholder:text-slate-400"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white py-3 rounded-xl text-xs font-semibold shadow-md shadow-blue-500/10 transition cursor-pointer"
                            >
                              手動パスキーで保管庫を解錠
                            </button>
                          </form>

                          {securityConfig.recoveryKeyWrappedMasterKey && (
                            <div className="text-center pt-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowRecoveryUnlockForm(true);
                                  setRecoveryError('');
                                }}
                                className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-bold transition cursor-pointer"
                              >
                                パスキーをお忘れですか？（保管庫暗号復元キーで救出）
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          <Server className="h-3 w-3 text-slate-400" />
                          {session.isOffline ? 'OFFLINE_MODE' : 'ONLINE_SSO'}
                        </div>
                        <button
                          onClick={triggerSSOLogout}
                          className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold transition flex items-center gap-1"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          ログアウト
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ------------------------------------------------------------- */
                /* 5. MAIN VAULT APPLICATION INTERFACE */
                /* ------------------------------------------------------------- */
                <>
                  {/* Top Bar Header */}
                  <header id="app-header" className="glass-surface border-b border-blue-100/60 py-3.5 px-6 shrink-0 flex items-center justify-between beveled-edge shadow-xs relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-xl text-blue-600 border border-blue-100/60 shadow-sm shadow-blue-600/5">
                        <Shield className="h-5 w-5 drop-shadow-[0_0_4px_rgba(37,99,235,0.2)]" />
                      </div>
                      <div>
                        <h1 className="text-md font-extrabold text-slate-900 flex items-center gap-1.5 leading-none font-sans">
                          NoppoPassword
                        </h1>
                        <span className="text-[9px] text-slate-400 font-mono tracking-wider">
                          AES_256_ACTIVE_LOCK
                        </span>
                      </div>
                    </div>

                    {/* Navigation inside header */}
                    <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                      <button
                        onClick={() => setActiveTab('vault')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeTab === 'vault' ? 'bg-[#0040e0] text-white shadow-sm shadow-blue-600/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        保管庫
                      </button>
                      <button
                        onClick={() => setActiveTab('generator')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeTab === 'generator' ? 'bg-[#0040e0] text-white shadow-sm shadow-blue-600/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        パスワード生成
                      </button>
                      <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeTab === 'audit' ? 'bg-[#0040e0] text-white shadow-sm shadow-blue-600/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        セキュリティ監査
                      </button>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          activeTab === 'settings' ? 'bg-[#0040e0] text-white shadow-sm shadow-blue-600/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        環境設定
                      </button>
                    </nav>

                    {/* User profile details and actions */}
                    <div className="flex items-center gap-3">
                      <div className="hidden lg:flex flex-col items-end leading-none">
                        <span className="text-xs font-bold text-slate-800">{session.userId}</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[130px] mt-0.5">{session.email}</span>
                      </div>
                      <img src={session.avatar} alt="Avatar profile" className="h-8 w-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => setIsLocked(true)}
                        title="保管庫を再ロック"
                        className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 shadow-sm cursor-pointer"
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={triggerSSOLogout}
                        title="サインアウト"
                        className="p-1.5 border border-slate-200 bg-white hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 shadow-sm cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </header>

                  {/* Responsive Mobile Tab Navigation */}
                  <div className="md:hidden bg-slate-100/75 border-b border-slate-200/60 p-2 overflow-x-auto flex gap-1 scrollbar-none">
                    <button
                      onClick={() => setActiveTab('vault')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        activeTab === 'vault' ? 'bg-[#0040e0] text-white shadow-sm' : 'text-slate-600 hover:bg-white/40'
                      }`}
                    >
                      保管庫
                    </button>
                    <button
                      onClick={() => setActiveTab('generator')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        activeTab === 'generator' ? 'bg-[#0040e0] text-white shadow-sm' : 'text-slate-600 hover:bg-white/40'
                      }`}
                    >
                      生成器
                    </button>
                    <button
                      onClick={() => setActiveTab('audit')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        activeTab === 'audit' ? 'bg-[#0040e0] text-white shadow-sm' : 'text-slate-600 hover:bg-white/40'
                      }`}
                    >
                      セキュリティ監査
                    </button>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        activeTab === 'settings' ? 'bg-[#0040e0] text-white shadow-sm' : 'text-slate-600 hover:bg-white/40'
                      }`}
                    >
                      環境設定
                    </button>
                  </div>

                  {/* MAIN CONTAINER BODY FRAME */}
                  <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl w-full mx-auto">
                    
                    {/* ----------------------------------------------------------- */}
                    {/* TAB PAGE 1: VAULT LIST VIEWER */}
                    {/* ----------------------------------------------------------- */}
                    {activeTab === 'vault' && (
                      <div id="tab-vault-view" className="space-y-6">
                        {/* Upper controls */}
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                          
                          {/* Search bar inputs */}
                          <div className="relative w-full sm:max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              placeholder="保管されたデータを検索..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-10 pl-10 text-xs focus:border-[#0040e0] focus:ring-1 focus:ring-blue-100 outline-none placeholder:text-slate-400 text-slate-800 font-sans transition"
                            />
                          </div>

                          {/* Quick add triggers */}
                          <button
                            onClick={handleOpenAddForm}
                            className="w-full sm:w-auto bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white font-bold rounded-xl py-2 px-4 text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/15 cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                            パスワード情報の追加
                          </button>
                        </div>

                        {/* Category pills board */}
                        <div className="flex gap-2 p-1 overflow-x-auto scrollbar-none select-none">
                          {[
                            { id: 'all', title: 'すべて', icon: Folder },
                            { id: 'web', title: 'ウェブサイト', icon: Globe },
                            { id: 'mail', title: 'メールアドレス', icon: Mail },
                            { id: 'ssh', title: 'サーバー / SSH', icon: Terminal },
                            { id: 'card', title: '暗証番号 / カード', icon: FileText },
                            { id: 'other', title: 'その他', icon: KeyRound }
                          ].map(cat => (
                            <button
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border cursor-pointer ${
                                selectedCategory === cat.id
                                  ? 'border-blue-200/70 bg-blue-50/80 text-[#0040e0] font-bold shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                              }`}
                            >
                              <cat.icon className="h-3.5 w-3.5" />
                              {cat.title}
                            </button>
                          ))}
                        </div>

                        {/* Passwords grid */}
                        {filteredEntries.length === 0 ? (
                          <div id="no-passwords-placeholder" className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/40 p-16 text-center max-w-2xl mx-auto my-6">
                            <Lock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-sm font-bold text-slate-700">
                              {searchQuery ? '検索条件に一致するデータが見つかりません' : '暗号保管室（Vault）は空っぽです'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                              {searchQuery 
                                ? '検索する語句を再確認するか、カテゴリ・大文字を調整してください。' 
                                : '「パスワード情報の追加」ボタンから、重要な認証データをAES-256規格で安全に保管しましょう。'}
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredEntries.map(entry => {
                              const isPassVisible = visiblePasswordId === entry.id;
                              
                              return (
                                <div
                                  key={entry.id}
                                  className="group relative rounded-2xl border border-slate-100 bg-white hover:border-blue-100 p-5 transition-all duration-300 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-[2px]"
                                >
                                  {/* Upper layout */}
                                  <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5 max-w-[70%]">
                                        <h3 className="text-sm font-extrabold text-slate-800 truncate select-all">{entry.title}</h3>
                                        {entry.url && (
                                          <a 
                                            href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`}
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-slate-400 hover:text-blue-600 transition truncate block max-w-xs cursor-pointer font-medium"
                                          >
                                            {entry.url}
                                          </a>
                                        )}
                                      </div>
                                      <span className="text-[9px] font-mono select-none px-2.5 py-0.5 rounded-lg uppercase bg-slate-50 text-slate-400 border border-slate-200/60 font-medium whitespace-nowrap">
                                        {entry.category}
                                      </span>
                                    </div>

                                    {/* Fields display */}
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between bg-slate-50/70 border border-slate-100/80 rounded-xl px-2.5 py-1.5 text-xs font-mono">
                                        <span className="text-slate-400 text-[9px] uppercase font-bold tracking-wider select-none shrink-0 w-8">USER</span>
                                        <span className="text-slate-700 select-all truncate max-w-[150px] font-sans font-medium">{entry.username}</span>
                                        <button 
                                          onClick={() => copyValueToClipboard(entry.username, `user-${entry.id}`)}
                                          className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                        >
                                          {copiedId === `user-${entry.id}` ? <Check className="h-3.5 w-3.5 text-emerald-500 font-bold" /> : <Clipboard className="h-3.5 w-3.5" />}
                                        </button>
                                      </div>

                                      <div className="flex items-center justify-between bg-slate-50/70 border border-slate-100/80 rounded-xl px-2.5 py-1.5 text-xs font-mono relative">
                                        <span className="text-slate-400 text-[9px] uppercase font-bold tracking-wider select-none shrink-0 w-8">PASS</span>
                                        <span className="text-slate-700 select-all font-mono leading-none overflow-x-auto scrollbar-none pr-12">
                                          {isPassVisible ? entry.passwordEncrypted : '••••••••••••'}
                                        </span>
                                        <div className="absolute right-2 flex items-center gap-1.5">
                                          <button
                                            onClick={() => setVisiblePasswordId(isPassVisible ? null : entry.id)}
                                            className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                          >
                                            {isPassVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                          </button>
                                          <button 
                                            onClick={() => copyValueToClipboard(entry.passwordEncrypted, `pass-${entry.id}`)}
                                            className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                          >
                                            {copiedId === `pass-${entry.id}` ? <Check className="h-3.5 w-3.5 text-emerald-500 font-bold" /> : <Clipboard className="h-3.5 w-3.5" />}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Notes encrypted view */}
                                  {entry.notesEncrypted && (
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] text-slate-500 leading-normal max-h-16 overflow-y-auto select-all">
                                      <span className="font-bold text-slate-400 block select-none mb-0.5">備考・メモ:</span> 
                                      {entry.notesEncrypted}
                                    </div>
                                  )}

                                  {/* Lower footer actions with dynamic score and password warnings */}
                                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[10px] text-slate-400 select-none">
                                    <div className="flex items-center gap-1.5 font-bold">
                                      <span className={`w-2 h-2 rounded-full ${
                                        entry.strengthScore <= 45 ? 'bg-red-500 animate-pulse' : entry.strengthScore <= 75 ? 'bg-amber-400' : 'bg-emerald-500'
                                      }`} />
                                      <span className={
                                        entry.strengthScore <= 45 ? 'text-red-500' : entry.strengthScore <= 75 ? 'text-amber-600' : 'text-emerald-600'
                                      }>
                                        {entry.strengthScore <= 45 ? '脆弱' : entry.strengthScore <= 75 ? '良好' : '安全'}: {entry.strengthScore}点
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => handleOpenEditForm(entry)}
                                        title="認証情報を編集"
                                        className="p-1 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-500 hover:text-slate-800 border border-slate-200/50 transition cursor-pointer"
                                      >
                                        <Edit3 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEntry(entry.id)}
                                        title="認証情報を削除"
                                        className="p-1 px-2 rounded-lg bg-slate-50 hover:bg-red-50 active:scale-95 text-slate-500 hover:text-red-600 border border-slate-200/50 transition cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ----------------------------------------------------------- */}
                    {/* TAB PAGE 2: STANDALONE ENGINE PASSWORD GENERATOR */}
                    {/* ----------------------------------------------------------- */}
                    {activeTab === 'generator' && (
                      <div id="tab-generator-view" className="max-w-xl mx-auto py-4">
                        <PasswordGenerator />
                      </div>
                    )}

                    {/* ----------------------------------------------------------- */}
                    {/* TAB PAGE 3: SECURITY AUDIT SCANNERS */}
                    {/* ----------------------------------------------------------- */}
                    {activeTab === 'audit' && (
                      <div id="tab-audit-view">
                        <AuditPanel 
                          entries={decryptedEntries} 
                          masterKey={masterKey}
                          onSelectEditEntry={(id) => {
                            const found = decryptedEntries.find(e => e.id === id);
                            if (found) {
                              handleOpenEditForm(found);
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* ----------------------------------------------------------- */}
                    {/* TAB PAGE 4: DETAILED ENVRIONMENTS & WIPE SETTINGS */}
                    {/* ----------------------------------------------------------- */}
                    {activeTab === 'settings' && (
                      <div id="tab-settings-view" className="space-y-8 max-w-xl mx-auto">
                        
                        {/* 2FA MFA settings card wrapper */}
                        <MfaSetup
                          isMfaEnabled={securityConfig.isMfaEnabled}
                          mfaSecret={securityConfig.mfaSecret}
                          mfaBackupCodes={securityConfig.mfaBackupCodes}
                          userEmail={session.email}
                          onSaveMfaSettings={(secret, enabled, backup) => {
                            const next = { ...securityConfig, mfaSecret: secret, isMfaEnabled: enabled, mfaBackupCodes: backup };
                            saveConfig(next);
                          }}
                          onClose={() => setActiveTab('vault')}
                        />

                        {/* 1. Vault Recovery Backup Key card */}
                        <div id="recovery-key-setup" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
                          <div>
                            <h3 className="text-md font-extrabold text-slate-900 flex items-center gap-2 font-sans">
                              <Key className="h-5 w-5 text-blue-600 drop-shadow-[0_0_4px_rgba(37,99,235,0.15)]" />
                              保管庫暗号復元キー（マスターパスキー紛失対策）
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 leading-normal">
                              解錠用のマスターパスキー（マスターキー）をド忘れしてしまった際に、保管庫内の暗号化データを完全に復旧し、新しいパスキーに安全に再暗号化（リセット）するための超高強度マスター暗号キーです。
                            </p>
                          </div>

                          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-3.5">
                            {securityConfig.recoveryKeyWrappedMasterKey ? (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full animate-fadeIn inline-flex items-center gap-1">
                                  ● 保管庫暗号復元キー設定済み
                                </span>
                                <button
                                  type="button"
                                  onClick={handleGenerateRecoveryKey}
                                  className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-95 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                  キーを再生成・更新
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-100 px-3 py-1 rounded-full animate-pulse inline-flex items-center gap-1">
                                  ▲ 未設定（生成を強く推奨）
                                </span>
                                <button
                                  type="button"
                                  onClick={handleGenerateRecoveryKey}
                                  className="bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  復元キーを生成
                                </button>
                              </div>
                            )}
                            <div className="text-[9px] text-slate-400 leading-normal space-y-1">
                              <p>※本キーは完全にゼロナレッジ（完全オフライン）のAE-AD暗号化によって保護されるため、運営側にも一切保持されません。安全なメモ帳などに厳重にコピーして保管してください。</p>
                              <p className="font-semibold text-blue-600">※二要素認証（MFA）が使えなくなった場合の「MFA緊急スキップ用コード」とは役割が全く異なります。これはいわば「マスターパスキーを忘れた際の救命具」です。</p>
                            </div>
                          </div>
                        </div>

                        {/* Automatic data wiper params config dashboard */}
                        <WipeSettings
                          failedAttemptsLimit={securityConfig.failedAttemptsLimit}
                          silentWipeCodeEncrypted={securityConfig.silentWipeCodeEncrypted}
                          onSaveWipeSettings={(limit, hash) => {
                            const next = { ...securityConfig, failedAttemptsLimit: limit, silentWipeCodeEncrypted: hash };
                            saveConfig(next);
                          }}
                          onClearAllData={handleWipeEntireDataManual}
                        />

                        {/* Device Biometrics setups toggle */}
                        <div id="biometrics-setup" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
                          <h3 className="text-md font-extrabold text-slate-900 flex items-center gap-2 font-sans">
                            <Fingerprint className="h-5 w-5 text-blue-600 drop-shadow-[0_0_4px_rgba(37,99,235,0.15)]" />
                            デバイス認証 (WebAuthn / Windows Hello, FaceID)
                          </h3>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            お使いのコンピュータ、タブレット、スマートフォンの認証ハードウェア（FaceID、TouchID、Windows Hello等）
                            とアプリを紐づけます。次回起動時からマスターキー入力の代わりに生体認証センサーを利用できます。
                          </p>

                          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                              <p className="text-xs font-bold text-slate-800">生体認証によるロック解除を設定する</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {securityConfig.isBiometricEnabled ? '現在デバイスと同期連携中' : '無効に設定中'}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                if (securityConfig.isBiometricEnabled) {
                                  const updated = { 
                                    ...securityConfig, 
                                    isBiometricEnabled: false, 
                                    biometricType: 'none' as any,
                                    biometricCredentialId: undefined,
                                    biometricWrappedKey: undefined,
                                    isBiometricFallback: undefined
                                  };
                                  saveConfig(updated);
                                  alert('生体認証連携を解除しました。');
                                } else {
                                  setActiveBiometricModal(true);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
                                securityConfig.isBiometricEnabled 
                                  ? 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-600' 
                                  : 'bg-[#0040e0] hover:bg-[#2e5bff] text-white shadow-sm shadow-blue-600/10'
                              }`}
                            >
                              {securityConfig.isBiometricEnabled ? '同期を解除' : '生体登録の開始'}
                            </button>
                          </div>
                        </div>

                        {/* HIGHLY VISIBLE DEDICATED BACKUP & MANUAL RECOVERY PANEL ONLINE/OFFLINE */}
                        <div id="manual-backup-setup" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
                          <h3 className="text-md font-extrabold text-slate-900 flex items-center gap-2 font-sans">
                            <FileText className="h-5 w-5 text-blue-600 drop-shadow-[0_0_4px_rgba(37,99,235,0.15)]" />
                            データ冗長化バックアップ・修復（データ流出・消失対策）
                          </h3>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            ブラウザの履歴削除、Cookieのクリア、端末移行などに備え、すべての保管情報を強力なAES-256暗号化状態のまま
                            バックアップファイルとしてローカルファイルシステムに安全に保存・復元できます。
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Export block */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between space-y-3">
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <Shield className="h-3.5 w-3.5 text-emerald-600" />
                                  手動バックアップを作成
                                </h4>
                                <p className="text-[10px] text-slate-400 leading-normal mt-1">
                                  現時点での保管庫のパスワード・マスターキー暗号データを安全な暗号化ファイル（.noppo）としてエクスポートします。
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleExportBackup}
                                className="w-full bg-[#0040e0] hover:bg-[#2e5bff] text-white py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <HardDriveDownload className="h-3.5 w-3.5" />
                                バックアップを出力する (.noppo)
                              </button>
                            </div>

                            {/* Import block */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between space-y-3">
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <LogIn className="h-3.5 w-3.5 text-blue-600" />
                                  バックアップから保管庫を復旧
                                </h4>
                                <p className="text-[10px] text-slate-400 leading-normal mt-1">
                                  保存していた暗号化ファイルをインポートし、保管庫の中身を上書きまたは追加して正常に復元します。
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => backupFileInputRef.current?.click()}
                                className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                バックアップを取り込む
                              </button>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </main>
                </>
              )}
            </>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 6. PASSWORD ADD & EDIT FORM DRAWER (OVERLAY MODAL) */}
          {/* ----------------------------------------------------------------- */}
          <AnimatePresence>
            {isEntryFormOpen && (
              <div id="entry-form-drawer" className="fixed inset-0 z-40 flex justify-end">
                {/* Backdrop overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsEntryFormOpen(false)}
                  className="absolute inset-0 bg-neutral-950/70 backdrop-blur-xs"
                />

                {/* Sliding panel content */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="relative h-full w-full max-w-md bg-white border-l border-blue-100 p-6 shadow-2xl overflow-y-auto space-y-6 flex flex-col justify-between"
                >
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-md font-extrabold text-slate-900 flex items-center gap-1.5 font-sans">
                        <KeyRound className="h-5 w-5 text-blue-600 drop-shadow-[0_0_4px_rgba(37,99,235,0.15)]" />
                        {editingEntry ? '秘密鍵情報の編集' : '新しいパスワードの暗号化追加'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1 leading-normal">
                        すべてのデータはAES-256規格で暗号化されて安全にデバイスにのみ残ります。
                      </p>
                    </div>

                    <form onSubmit={handleSaveEntry} className="space-y-4">
                      {/* Name / Title */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">タイトル / サービス名 *</label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="例: Netflix, Google, GitHub"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition font-sans placeholder:text-slate-400"
                        />
                      </div>

                      {/* Web URL */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">URL / 接続先アドレス</label>
                        <input
                          type="text"
                          value={formUrl}
                          onChange={(e) => setFormUrl(e.target.value)}
                          placeholder="例: https://github.com"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition font-sans placeholder:text-slate-400"
                        />
                      </div>

                      {/* Category Switcher */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">カテゴリ</label>
                          <select
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value as any)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition text-slate-700 font-sans cursor-pointer"
                          >
                            <option value="web">ウェブ</option>
                            <option value="mail">メール</option>
                            <option value="ssh">サーバー SSH</option>
                            <option value="card">暗証番号 / カード</option>
                            <option value="other">その他</option>
                          </select>
                        </div>

                        {/* Username */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">ログインユーザー名 *</label>
                          <input
                            type="text"
                            required
                            value={formUsername}
                            onChange={(e) => setFormUsername(e.target.value)}
                            placeholder="例: main-user_id, email"
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition font-sans placeholder:text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div className="space-y-1 relative">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">パスワード / 認証暗証番号 *</label>
                        <div className="flex items-center relative">
                          <input
                            type="text"
                            required
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                            placeholder="英大文字・小文字・記号を混在"
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition pr-10 font-mono tracking-wide placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(formPassword);
                                setFormCopied(true);
                                setTimeout(() => setFormCopied(false), 2000);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                          >
                            {formCopied ? <Check className="h-4.5 w-4.5 text-emerald-500 font-bold" /> : <Clipboard className="h-4.5 w-4.5" />}
                          </button>
                        </div>

                        {/* Form password Realtime validation strength score display */}
                        {formPassword && (
                          <div className="pt-2">
                            {(() => {
                              const s = calculatePasswordStrength(formPassword);
                              return (
                                <div className="space-y-1 bg-slate-50/50 p-2.5 border border-slate-100 rounded-xl">
                                  <div className="flex justify-between items-center text-[10px] uppercase font-bold font-mono">
                                    <span className="text-slate-400">強度評価:</span>
                                    <span style={{ 
                                      color: s.status === 'Strong' ? '#10b981' : 
                                             s.status === 'Good' ? '#059669' : 
                                             s.status === 'Fair' ? '#d97706' : '#dc2626' 
                                    }}>
                                      {s.status === 'Strong' ? '強力' : s.status === 'Good' ? '良好' : s.status === 'Fair' ? '弱い' : '危険'} ({s.score}/100点)
                                    </span>
                                  </div>
                                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full truncate ${
                                      s.score <= 45 ? 'bg-red-500' : s.score <= 75 ? 'bg-amber-400' : 'bg-emerald-500'
                                    }`} style={{ width: `${s.score}%` }} />
                                  </div>
                                  {s.feedback.length > 0 && (
                                    <p className="text-[9px] text-amber-600 font-bold">
                                      ※ {s.feedback[0]}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Backup/Notes details encrypted */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">備考 / プライベート暗号メモ</label>
                        <textarea
                          rows={3}
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          placeholder="リカバリ暗証コード、セキュリティ秘密の質問などを記入(暗号化領域)"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition resize-none font-sans placeholder:text-slate-400"
                        />
                      </div>

                      {/* Standard buttons layout */}
                      <div className="flex gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => setIsEntryFormOpen(false)}
                          className="w-1/2 border border-slate-200 bg-white hover:bg-slate-50 py-2.5 rounded-xl text-xs font-bold text-slate-600 transition cursor-pointer"
                        >
                          キャンセル
                        </button>
                        <button
                          type="submit"
                          className="w-1/2 bg-[#0040e0] hover:bg-[#2e5bff] py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm shadow-blue-500/10 cursor-pointer"
                        >
                          保管室を施錠保存
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Inline interactive generator engine embedded within drawer */}
                  <div className="border-t border-neutral-800/80 pt-6 mt-6">
                    <PasswordGenerator onSelectPassword={applyGeneratedPasswordToForm} inline={true} />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ----------------------------------------------------------------- */}
          {/* 7. BIOMETRICS DEVICE DIALOGUE TRIGGER MODAL */}
          {/* ----------------------------------------------------------------- */}
          {/* Recovery Setup Presentation Modal */}
          {showRecoverySetupModal && (
            <div id="recovery-setup-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div 
                onClick={() => setShowRecoverySetupModal(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-[6px]" 
              />
              <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl z-10 animate-scaleUp">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="bg-emerald-50 p-4 rounded-full border border-emerald-100 text-emerald-600">
                    <Key className="h-6 w-6" />
                  </div>
                  <h3 className="text-md font-extrabold tracking-tight text-slate-900 font-sans">
                    保管庫復旧用バックアップキーの生成成功
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-normal font-sans">
                    マスターパスキーを紛失した際、この専用キーがあればすべてのパスワード情報を完全に復元可能です。
                  </p>

                  <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 my-1 select-all relative group">
                    <span className="text-xs font-mono font-extrabold tracking-wider text-slate-800 break-all select-all block py-1 text-center">
                      {generatedRecoveryKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedRecoveryKey);
                        setCopiedRecoveryKey(true);
                        setTimeout(() => setCopiedRecoveryKey(false), 3000);
                      }}
                      className="absolute right-2 top-2 p-1.5 bg-white text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg cursor-pointer transition select-none flex items-center gap-1 text-[10px]"
                    >
                      {copiedRecoveryKey ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600 font-extrabold" />
                          コピー
                        </>
                      ) : (
                        <>
                          <Clipboard className="h-3 w-3" />
                          コピー
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-3 bg-red-50 border border-red-100 text-[10px] text-red-600 rounded-xl leading-relaxed text-left">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                      重要：この画面を閉じるとキーは二度と表示されません！
                    </p>
                    このキーはクラウドや運営サーバー上には一切保持されません。スクリーンショットを保存するか、紙に書いて安全なオフラインの場所に厳重に秘匿してください。
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRecoverySetupModal(false)}
                    className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    安全に保管したので閉じる
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Passkey Change Forced Modal (After successful recovery with backup key) */}
          {showPasskeyResetAfterRecovery && (
            <div id="passkey-reset-after-recovery-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[8px]" />
              <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl z-10 animate-scaleUp">
                <form onSubmit={handleResetPasskeyWithRestoredKey} className="space-y-4">
                  <div className="text-center space-y-2">
                    <div className="bg-blue-50 p-3 rounded-full border border-blue-100 text-blue-600 mx-auto w-12 flex items-center justify-center">
                      <ShieldAlert className="h-5 w-5 animate-pulse" />
                    </div>
                    <h3 className="text-md font-extrabold text-slate-900">スマートパスキーの再設定</h3>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      バックアップキーから保管庫の暗号データを復号しました。新しい解錠パスキーを設定して、安全に再暗号化（ロック）してください。
                    </p>
                  </div>

                  <div className="space-y-3 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        新しい解錠パスキー (8文字以上)
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="新しいパスキーを設定"
                        value={resetPasskey}
                        onChange={(e) => setResetPasskey(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2.5 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        新パスキーの再確認
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="パスキーを再入力"
                        value={resetPasskeyConfirm}
                        onChange={(e) => setResetPasskeyConfirm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2.5 text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-100 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#0040e0] hover:bg-[#2e5bff] active:scale-95 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    新しいパスキーを有効化し、再暗号化を適用
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeBiometricModal && (
            <BiometricModal
              isOpen={activeBiometricModal}
              onClose={() => setActiveBiometricModal(false)}
              allowedCredentialId={securityConfig.biometricCredentialId}
              onSuccess={(credentialId, rawId, isFallback) => {
                if (isLocked) {
                  handleBiometricUnlockSuccess(credentialId, rawId, isFallback);
                } else {
                  // Setup/Registration flow
                  if (!masterKey) {
                    alert('保管庫が解錠されておらず、マスターキーがメモリにありません。');
                    setActiveBiometricModal(false);
                    return;
                  }
                  
                  // Wrap current masterKey securely as biometric credentials response
                  const salt = session?.email || "noppodev@gmail.com";
                  let wrapped = '';
                  if (isFallback) {
                    const wrappingKey = hashSHA256("NoppoPass-BiometricsSession-2026" + salt);
                    wrapped = encryptData(masterKey, wrappingKey);
                  } else if (rawId) {
                    const wrappingKey = hashSHA256(rawId + salt);
                    wrapped = encryptData(masterKey, wrappingKey);
                  }

                  if (!wrapped) {
                    alert('生体認証キーのラップ暗号化に失敗しました。');
                    setActiveBiometricModal(false);
                    return;
                  }

                  // Register biometrics setups completed trigger
                  const nextConfig: SecurityConfig = {
                    ...securityConfig,
                    isBiometricEnabled: true,
                    biometricType: isFallback ? 'fingerprint' : 'fingerprint', // Standard fingerprint presentation
                    biometricCredentialId: credentialId,
                    biometricWrappedKey: wrapped,
                    isBiometricFallback: isFallback
                  };
                  saveConfig(nextConfig);
                  if (isFallback) {
                    alert('デバイス制限により疑似スキャンとして紐づけ完了しました。次回以降スマートロック解除が可能です。');
                  } else {
                    alert('OS/デバイスの安全な生体認証をこのブラウザと紐づけました。次回以降マスターキー入力をスキップできます。');
                  }
                  setActiveBiometricModal(false);
                }
              }}
              actionType={isLocked ? 'unlock' : 'setup'}
              biometricType={securityConfig.biometricType}
            />
          )}

        </>
      )}

    </div>
  );
}
