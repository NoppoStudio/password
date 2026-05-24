/**
 * TypeScript types for NoppoPassword
 */

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  passwordEncrypted: string; // AES-256 encrypted password
  url?: string;
  notesEncrypted?: string; // AES-256 encrypted notes
  category: 'web' | 'card' | 'mail' | 'ssh' | 'other';
  strengthScore: number; // 0 - 100
  createdAt: string;
  updatedAt: string;
  lastAudited?: string;
}

export interface UserSession {
  userId: string;
  email: string;
  avatar?: string;
  isMfaVerified: boolean;
  isOffline: boolean;
}

export interface SecurityConfig {
  mfaSecret: string; // TOTP secret (base32)
  isMfaEnabled: boolean;
  mfaBackupCodes: string[];
  failedAttemptsLimit: number; // e.g. 5
  silentWipeCodeEncrypted: string; // SHA-256 hash
  isBiometricEnabled: boolean;
  biometricType: 'fingerprint' | 'face' | 'none';
  lastWipeAttemptCount: number;
  biometricCredentialId?: string; // WebAuthn Credential ID (Base64)
  biometricWrappedKey?: string; // AES wrapped masterKey (Base64)
  isBiometricFallback?: boolean; // Whether fallback mock mode is active for biometrics
  recoveryKeyWrappedMasterKey?: string; // AES wrapped masterKey using Recovery Key (Base64)
  recoveryKeyHash?: string; // SHA-256 hash of the recovery key
}

export interface SecurityScore {
  score: number; // 0 - 100
  rating: 'Excellent' | 'Good' | 'Fair' | 'Weak' | 'Danger';
  hasDuplicates: boolean;
  weakCount: number;
  oldCount: number;
  reusedCount: number;
}

export interface AuditIssue {
  id: string;
  entryId: string;
  title: string;
  username: string;
  issueType: 'weak' | 'reused' | 'old' | 'pwned';
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}
