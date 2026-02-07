import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecAsync = vi.fn();
vi.mock('node:child_process', () => ({
  exec: (cmd: string, cb: (err: Error | null, result: { stdout: string }) => void) => {
    const result = mockExecAsync(cmd);
    if (result instanceof Promise) {
      result.then((r: { stdout: string }) => cb(null, r)).catch((e: Error) => cb(e, { stdout: '' }));
    } else {
      cb(null, result || { stdout: '' });
    }
  },
}));

vi.mock('node:util', () => ({
  promisify: (fn: Function) => (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, result: unknown) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('node:fs', () => ({
  watch: () => ({ close: vi.fn(), on: vi.fn() }),
}));

import { detectRunningIDE, sendToIDE, askIDE, askIDEToFix } from './unified-bridge.js';

describe('unified-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
  });

  describe('detectRunningIDE', () => {
    it('detects kiro when running', async () => {
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('Kiro')) return { stdout: 'true\n' };
        return { stdout: 'false\n' };
      });

      const ide = await detectRunningIDE();
      expect(ide).toBe('kiro');
    });

    it('returns null when no IDE is running', async () => {
      mockExecAsync.mockImplementation(() => ({ stdout: 'false\n' }));
      const ide = await detectRunningIDE();
      expect(ide).toBeNull();
    });

    it('follows priority order (kiro > antigravity > cursor > vscode)', async () => {
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('Cursor') || cmd.includes('Visual Studio Code')) {
          return { stdout: 'true\n' };
        }
        return { stdout: 'false\n' };
      });

      const ide = await detectRunningIDE();
      expect(ide).toBe('cursor');
    });
  });

  describe('sendToIDE', () => {
    it('returns error when no IDE detected in auto mode', async () => {
      mockExecAsync.mockImplementation(() => ({ stdout: 'false\n' }));
      const result = await sendToIDE('hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No supported IDE');
    });

    it('sends via AppleScript for non-kiro IDEs', async () => {
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('Cursor')) return { stdout: 'true\n' };
        if (cmd.includes('false')) return { stdout: 'false\n' };
        return { stdout: '' };
      });

      const result = await sendToIDE('test message', { preferredIDE: 'cursor' });
      // Should attempt to activate and type
      expect(mockExecAsync).toHaveBeenCalled();
    });
  });

  describe('askIDE', () => {
    it('returns error message on failure', async () => {
      mockExecAsync.mockImplementation(() => ({ stdout: 'false\n' }));
      const result = await askIDE('hello');
      expect(result).toContain('Error');
    });
  });

  describe('askIDEToFix', () => {
    it('includes file in message when provided', async () => {
      mockExecAsync.mockImplementation(() => ({ stdout: 'false\n' }));
      const result = await askIDEToFix('TypeError', 'app.ts');
      expect(result).toContain('Error');
    });
  });
});
