import CryptoJS from 'crypto-js';

/**
 * Base32 letters to binary representation converter for TOTP
 */
function decodeBase32(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  
  for (let i = 0; i < cleanBase32.length; i++) {
    const val = alphabet.indexOf(cleanBase32[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const result = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
  }
  return result;
}

/**
 * Generate a 6-digit TOTP code based on base32 secret and time interval
 */
export function generateTOTP(secret: string, timeOffsetSeconds = 0): string {
  try {
    if (!secret) return '000000';
    const keyBytes = decodeBase32(secret);
    
    // Time step (30 seconds)
    const epoch = Math.floor((Date.now() / 1000 + timeOffsetSeconds) / 30);
    
    // Convert epoch to 8-byte hexadecimal string representation
    let timeHex = epoch.toString(16).padStart(16, '0');
    
    // HMAC-SHA1 using CryptoJS
    const keyWordArray = CryptoJS.lib.WordArray.create(keyBytes as any);
    const timeWordArray = CryptoJS.enc.Hex.parse(timeHex);
    
    const hmac = CryptoJS.HmacSHA1(timeWordArray, keyWordArray);
    const hmacHex = hmac.toString(CryptoJS.enc.Hex);
    
    // Dynamic truncation
    const offset = parseInt(hmacHex.substring(hmacHex.length - 1), 16);
    const partHex = hmacHex.substring(offset * 2, offset * 2 + 8);
    const partInt = parseInt(partHex, 16) & 0x7fffffff;
    
    const otp = partInt % 1000000;
    return otp.toString().padStart(6, '0');
  } catch (error) {
    console.error('Error calculating TOTP:', error);
    return '000000';
  }
}

/**
 * Verifies if the provided TOTP code is correct.
 * Allows a cushion window of -1 to +1 steps (30 seconds before/after) to account for time drift.
 */
export function verifyTOTP(secret: string, inputCode: string): boolean {
  if (!secret || !inputCode) return false;
  const cleanInput = inputCode.trim().replace(/\s/g, '');
  if (cleanInput.length !== 6) return false;

  // Let's test current code, 1 step back, and 1 step forward.
  for (let offset = -1; offset <= 1; offset++) {
    if (generateTOTP(secret, offset * 30) === cleanInput) {
      return true;
    }
  }
  return false;
}

/**
 * Generates a random Base32 secret for MFA setup
 */
export function generateBase32Secret(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  const rand = new Uint32Array(length);
  window.crypto.getRandomValues(rand);
  
  for (let i = 0; i < length; i++) {
    result += alphabet[rand[i] % alphabet.length];
  }
  return result;
}

/**
 * Generate recovery codes in case the user loses access to authenticator App
 */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  const chars = '0123456789ABCDEF';
  
  for (let i = 0; i < count; i++) {
    let singleCode = '';
    const rand = new Uint32Array(8);
    window.crypto.getRandomValues(rand);
    for (let j = 0; j < 8; j++) {
      singleCode += chars[rand[j] % chars.length];
    }
    // Format: XXXX-XXXX
    codes.push(`${singleCode.substring(0, 4)}-${singleCode.substring(4, 8)}`);
  }
  return codes;
}
