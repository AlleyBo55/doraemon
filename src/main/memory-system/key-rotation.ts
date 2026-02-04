/**
 * Key Rotation System
 * 
 * Manages encryption key lifecycle:
 * - Automatic rotation on schedule
 * - Re-encryption of existing data
 * - Key versioning for backward compatibility
 */

import { createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const KEY_DIR = join(homedir(), '.doraemon', 'keys');
const KEY_METADATA_FILE = 'key-metadata.json';
const ROTATION_INTERVAL_DAYS = 30;
const MAX_KEY_VERSIONS = 5;

interface KeyMetadata {
  version: number;
  createdAt: string;
  rotatedAt?: string;
  algorithm: string;
  iterations: number;
  salt: string;
  active: boolean;
}

interface KeyStore {
  currentVersion: number;
  keys: KeyMetadata[];
  lastRotation: string;
  nextRotation: string;
}

let keyStore: KeyStore | null = null;
let derivedKeys: Map<number, Buffer> = new Map();

function ensureKeyDir(): void {
  if (!existsSync(KEY_DIR)) {
    mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadKeyStore(): KeyStore {
  if (keyStore) return keyStore;
  
  ensureKeyDir();
  const metadataPath = join(KEY_DIR, KEY_METADATA_FILE);
  
  if (existsSync(metadataPath)) {
    try {
      const content = readFileSync(metadataPath, 'utf-8');
      keyStore = JSON.parse(content);
      return keyStore!;
    } catch {
      // Corrupted, create new
    }
  }
  
  keyStore = createInitialKeyStore();
  saveKeyStore();
  return keyStore;
}

function saveKeyStore(): void {
  if (!keyStore) return;
  
  ensureKeyDir();
  const metadataPath = join(KEY_DIR, KEY_METADATA_FILE);
  writeFileSync(metadataPath, JSON.stringify(keyStore, null, 2), { mode: 0o600 });
}

function createInitialKeyStore(): KeyStore {
  const now = new Date();
  const nextRotation = new Date(now.getTime() + ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  
  const initialKey: KeyMetadata = {
    version: 1,
    createdAt: now.toISOString(),
    algorithm: 'aes-256-gcm',
    iterations: 100000,
    salt: randomBytes(32).toString('hex'),
    active: true,
  };
  
  return {
    currentVersion: 1,
    keys: [initialKey],
    lastRotation: now.toISOString(),
    nextRotation: nextRotation.toISOString(),
  };
}

function getMachineSecret(): string {
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

export function deriveKey(version?: number): Buffer {
  const store = loadKeyStore();
  const keyVersion = version || store.currentVersion;
  
  if (derivedKeys.has(keyVersion)) {
    return derivedKeys.get(keyVersion)!;
  }
  
  const keyMeta = store.keys.find(k => k.version === keyVersion);
  if (!keyMeta) {
    throw new Error(`Key version ${keyVersion} not found`);
  }
  
  const secret = getMachineSecret();
  const salt = Buffer.from(keyMeta.salt, 'hex');
  const key = pbkdf2Sync(secret, salt, keyMeta.iterations, 32, 'sha512');
  
  derivedKeys.set(keyVersion, key);
  return key;
}

export function getCurrentKeyVersion(): number {
  return loadKeyStore().currentVersion;
}

export function shouldRotateKey(): boolean {
  const store = loadKeyStore();
  const nextRotation = new Date(store.nextRotation);
  return new Date() >= nextRotation;
}

export function rotateKey(): { oldVersion: number; newVersion: number } {
  const store = loadKeyStore();
  const oldVersion = store.currentVersion;
  const newVersion = oldVersion + 1;
  
  const now = new Date();
  const nextRotation = new Date(now.getTime() + ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  
  const oldKey = store.keys.find(k => k.version === oldVersion);
  if (oldKey) {
    oldKey.active = false;
    oldKey.rotatedAt = now.toISOString();
  }
  
  const newKey: KeyMetadata = {
    version: newVersion,
    createdAt: now.toISOString(),
    algorithm: 'aes-256-gcm',
    iterations: 100000,
    salt: randomBytes(32).toString('hex'),
    active: true,
  };
  
  store.keys.push(newKey);
  store.currentVersion = newVersion;
  store.lastRotation = now.toISOString();
  store.nextRotation = nextRotation.toISOString();
  
  if (store.keys.length > MAX_KEY_VERSIONS) {
    store.keys = store.keys.slice(-MAX_KEY_VERSIONS);
  }
  
  derivedKeys.delete(oldVersion);
  
  saveKeyStore();
  
  return { oldVersion, newVersion };
}

export function getKeyRotationStatus(): {
  currentVersion: number;
  lastRotation: string;
  nextRotation: string;
  daysUntilRotation: number;
  totalVersions: number;
} {
  const store = loadKeyStore();
  const nextRotation = new Date(store.nextRotation);
  const daysUntilRotation = Math.max(0, Math.ceil((nextRotation.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  
  return {
    currentVersion: store.currentVersion,
    lastRotation: store.lastRotation,
    nextRotation: store.nextRotation,
    daysUntilRotation,
    totalVersions: store.keys.length,
  };
}

export function canDecryptVersion(version: number): boolean {
  const store = loadKeyStore();
  return store.keys.some(k => k.version === version);
}
