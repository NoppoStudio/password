import CryptoJS from 'crypto-js';

/**
 * Encrypt dynamic data using AES-256 with a provided master key
 */
export function encryptData(plainText: string, key: string): string {
  try {
    if (!plainText) return '';
    return CryptoJS.AES.encrypt(plainText, key).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return '';
  }
}

/**
 * Decrypt data using AES-256 with a provided master key.
 * Returns empty string if decryption fails or key is invalid.
 */
export function decryptData(encryptedText: string, key: string): string {
  try {
    if (!encryptedText) return '';
    const bytes = CryptoJS.AES.decrypt(encryptedText, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error('Malformed UTF-8 / wrong key');
    }
    return decrypted;
  } catch (error) {
    console.error('Decryption failed. Invalid master key/unauthorized.');
    return '';
  }
}

/**
 * Hash data using SHA-256
 */
export function hashSHA256(text: string): string {
  if (!text) return '';
  return CryptoJS.SHA256(text).toString();
}

/**
 * PBKDF2 derivative to generate a strong key from master password and email/salt
 */
export function deriveKeyPBKDF2(password: string, salt: string): string {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 1000,
  });
  return key.toString();
}

/**
 * Dictionary of common, compromised, or easily guessable passwords
 */
const COMMON_PASSWORDS = [
  '123456', '123456789', 'picture', 'password', '12345', '12345678', 
  'superman', 'qwerty', '111111', '123123', 'admin', 'welcome', 'letmein',
  '1234567', 'iloveyou', 'signing', 'monkey', 'secret', 'noppo', 'pass123'
];

/**
 * Calculate password strength and return score (0-100) and feedback
 */
export interface StrengthResult {
  score: number;
  feedback: string[];
  color: string;
  status: 'Critical' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

export function calculatePasswordStrength(password: string): StrengthResult {
  if (!password) {
    return { score: 0, feedback: ['パスワードを入力してください'], color: 'bg-gray-400', status: 'Weak' };
  }

  const feedback: string[] = [];
  let score = 0;

  // Length Evaluation
  if (password.length < 8) {
    score += 5;
    feedback.push('文字数が少なすぎます（最低8文字、推奨12文字以上）');
  } else if (password.length >= 8 && password.length < 12) {
    score += 20;
    feedback.push('長さは標準的ですが、12文字以上にするとより強固になります');
  } else if (password.length >= 12 && password.length < 16) {
    score += 40;
  } else if (password.length >= 16) {
    score += 50;
  }

  // Character variety checks
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (hasUpper) score += 10;
  else feedback.push('大文字 (A-Z) を含めてください');

  if (hasLower) score += 10;
  else feedback.push('小文字 (a-z) を含めてください');

  if (hasDigit) score += 15;
  else feedback.push('数字 (0-9) を含めてください');

  if (hasSpecial) score += 15;
  else feedback.push('記号 (!@#$%^&* など) を含めてください');

  // Check dictionary
  const lowerPass = password.toLowerCase();
  const isCommon = COMMON_PASSWORDS.some(common => lowerPass.includes(common));
  if (isCommon) {
    score = Math.min(score, 25); // Cap score severely
    feedback.push('予測が容易な一般的な単語やパターンが含まれています');
  }

  // Bonus logic for entropy (unique character count ratio)
  const uniqueChars = new Set(password).size;
  if (uniqueChars / password.length < 0.5 && password.length >= 6) {
    score -= 15;
    feedback.push('同じ文字の繰り返しが多いです。多様な文字をご使用ください');
  }

  // Normalize score
  score = Math.max(0, Math.min(100, score));

  // Category selection
  let status: 'Critical' | 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
  let color = 'bg-red-500';

  if (score < 30) {
    status = 'Critical';
    color = 'bg-red-600';
  } else if (score < 50) {
    status = 'Weak';
    color = 'bg-orange-500';
  } else if (score < 70) {
    status = 'Fair';
    color = 'bg-yellow-500';
  } else if (score < 85) {
    status = 'Good';
    color = 'bg-green-500';
  } else {
    status = 'Strong';
    color = 'bg-emerald-600';
  }

  return { score, feedback, color, status };
}

/**
 * Automatically generate a highly cryptographically secure password
 */
export function generateSecurePassword(length = 16, upper = true, lower = true, digits = true, symbols = true): string {
  let charSet = '';
  if (upper) charSet += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lower) charSet += 'abcdefghijklmnopqrstuvwxyz';
  if (digits) charSet += '0123456789';
  if (symbols) charSet += '!@#$%^&*()_+~`|}{[]:;?><,./-=';

  if (!charSet) charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';

  let result = '';
  const randomValues = new Uint32Array(length);
  window.crypto.getRandomValues(randomValues);

  // Guarantee at least one of each selected type if length is sufficient
  let requiredChars: string[] = [];
  if (upper) requiredChars.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]);
  if (lower) requiredChars.push('abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]);
  if (digits) requiredChars.push('0123456789'[Math.floor(Math.random() * 10)]);
  if (symbols) requiredChars.push('!@#$%^&*()_+~`|}{[]:;?><,./-='[Math.floor(Math.random() * '!@#$%^&*()_+~`|}{[]:;?><,./-='.length)]);

  for (let i = 0; i < length; i++) {
    const randomIndex = randomValues[i] % charSet.length;
    result += charSet[randomIndex];
  }

  // Inject required chars at random locations
  const resultArr = result.split('');
  requiredChars.forEach((rc, idx) => {
    if (idx < resultArr.length) {
      resultArr[idx] = rc;
    }
  });

  // Shuffle result
  return resultArr.sort(() => Math.random() - 0.5).join('');
}
