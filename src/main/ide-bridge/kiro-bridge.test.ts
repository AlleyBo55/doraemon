import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FSWatcher } from 'node:fs';

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue('{}');
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    access: (...args: unknown[]) => mockAccess(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));

let watchCallback: ((event: string, filename: string) => void) | null = null;
const mockWatcherClose = vi.fn();
const mockWatcherOn = vi.fn();

vi.mock('node:fs', () => ({
  watch: (_path: string, cb: (event: string, filename: string) => void) => {
    watchCallback = cb;
    return { close: mockWatcherClose, on: mockWatcherOn } as unknown as FSWatcher;
  },
}));

import {
  initKiroBridge,
  sendToKiro,
  askKiro,
  askKiroToFix,
  askKiroToExplain,
  askKiroToReview,
  closeKiroBridge,
} from './kiro-bridge.js';

function getLastWriteCall(): { path: string; content: string } | null {
  if (mockWriteFile.mock.calls.length === 0) return null;
  const last = mockWriteFile.mock.calls[mockWriteFile.mock.calls.length - 1];
  return { path: last[0] as string, content: last[1] as string };
}

describe('kiro-bridge', () => {
  beforeEach(() => {
    closeKiroBridge();
    vi.clearAllMocks();
    watchCallback = null;
  });

  afterEach(() => {
    closeKiroBridge();
  });

  describe('initKiroBridge', () => {
    it('initializes with explicit workspace path', async () => {
      const result = await initKiroBridge('/test/workspace');
      expect(result).toBe(true);
      expect(mockMkdir).toHaveBeenCalled();
      const mkdirPath = mockMkdir.mock.calls[0][0] as string;
      expect(mkdirPath).toContain('.doraemon');
    });

    it('returns true on re-init with same workspace', async () => {
      await initKiroBridge('/test/workspace');
      const result = await initKiroBridge('/test/workspace');
      expect(result).toBe(true);
    });
  });

  describe('sendToKiro', () => {
    it('writes request file with correct structure', async () => {
      const promise = sendToKiro('hello', 'chat', undefined, '/test/workspace');

      await Promise.race([
        promise,
        new Promise(r => setTimeout(r, 100)),
      ]);

      const call = getLastWriteCall();
      expect(call).not.toBeNull();
      expect(call!.path).toContain('request.json');
      expect(call!.content).toContain('"type": "chat"');
      expect(call!.content).toContain('"message": "hello"');
    });
  });

  describe('convenience functions', () => {
    it('askKiro sends chat type', async () => {
      const promise = askKiro('test message', '/test/workspace');
      await Promise.race([promise, new Promise(r => setTimeout(r, 100))]);

      const call = getLastWriteCall();
      expect(call).not.toBeNull();
      expect(call!.content).toContain('"type": "chat"');
    });

    it('askKiroToFix sends fix-error type', async () => {
      const promise = askKiroToFix('TypeError', 'app.ts', '/test/workspace');
      await Promise.race([promise, new Promise(r => setTimeout(r, 100))]);

      const call = getLastWriteCall();
      expect(call).not.toBeNull();
      expect(call!.content).toContain('"type": "fix-error"');
    });

    it('askKiroToExplain sends explain type', async () => {
      const promise = askKiroToExplain('const x = 1', 'test.ts', '/test/workspace');
      await Promise.race([promise, new Promise(r => setTimeout(r, 100))]);

      const call = getLastWriteCall();
      expect(call).not.toBeNull();
      expect(call!.content).toContain('"type": "explain"');
    });

    it('askKiroToReview sends code-review type', async () => {
      const promise = askKiroToReview('app.ts', '/test/workspace');
      await Promise.race([promise, new Promise(r => setTimeout(r, 100))]);

      const call = getLastWriteCall();
      expect(call).not.toBeNull();
      expect(call!.content).toContain('"type": "code-review"');
    });
  });

  describe('closeKiroBridge', () => {
    it('cleans up watcher and callbacks', async () => {
      await initKiroBridge('/test/workspace');
      closeKiroBridge();
      expect(mockWatcherClose).toHaveBeenCalled();
    });
  });
});
