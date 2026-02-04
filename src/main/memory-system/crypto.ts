/**
 * Cryptographic utilities for secure memory storage
 * 
 * Uses AES-256-GCM for encryption (authenticated encryption)
 * PBKDF2 for key derivation with automatic key rotation
 * SHA-256 for hashing and integrity
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
import {
  deriveKey as deriveRotatingKey,
  getCurrentKeyVersion,
  shouldRotateKey,
  rotateKey,
  getKeyRotationStatus,
  canDecryptVersion,
} from './key-rotation.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

let masterKey: Buffer | null = null;
let keySalt: Buffer | null = null;
let useKeyRotation = false;

export function initializeCrypto(passphrase?: string, enableKeyRotation = true): void {
  useKeyRotation = enableKeyRotation;
  
  if (useKeyRotation) {
    // Use key rotation system
    masterKey = deriveRotatingKey();
    keySalt = randomBytes(SALT_LENGTH);
    
    // Check if rotation is needed
    if (shouldRotateKey()) {
      const { oldVersion, newVersion } = rotateKey();
      masterKey = deriveRotatingKey(newVersion);
      console.log(`[Crypto] Key rotated from v${oldVersion} to v${newVersion}`);
    }
  } else {
    // Legacy: derive from machine secret
    keySalt = randomBytes(SALT_LENGTH);
    const secret = passphrase || generateMachineSecret();
    masterKey = pbkdf2Sync(secret, keySalt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  }
}

export function isInitialized(): boolean {
  return masterKey !== null;
}

function generateMachineSecret(): string {
  const os = require('os');
  const factors = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown',
    process.env.USER || process.env.USERNAME || 'user',
  ];
  return createHash('sha256').update(factors.join('|')).digest('hex');
}

export function encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  if (!masterKey) {
    initializeCrypto();
  }
  
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey!, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const tag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decrypt(ciphertext: string, iv: string, tag: string): string {
  if (!masterKey) {
    throw new Error('Crypto not initialized');
  }
  
  const decipher = createDecipheriv(
    ALGORITHM,
    masterKey,
    Buffer.from(iv, 'base64')
  );
  
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function signContent(content: string): string {
  if (!masterKey) {
    throw new Error('Crypto not initialized');
  }
  return createHmac('sha256', masterKey).update(content).digest('hex');
}

export function verifySignature(content: string, signature: string): boolean {
  const expected = signContent(content);
  if (expected.length !== signature.length) return false;
  
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

export function generateEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `mem_${timestamp}_${random}`;
}

export function secureWipe(buffer: Buffer): void {
  buffer.fill(0);
  randomBytes(buffer.length).copy(buffer);
  buffer.fill(0);
}

export function deriveKeyForEntry(entryId: string): Buffer {
  if (!masterKey || !keySalt) {
    throw new Error('Crypto not initialized');
  }
  return pbkdf2Sync(
    Buffer.concat([masterKey, Buffer.from(entryId)]),
    keySalt,
    10000,
    KEY_LENGTH,
    'sha256'
  );
}

export { getKeyRotationStatus, canDecryptVersion, getCurrentKeyVersion };
