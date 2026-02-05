import { homedir } from 'os';

const HOME = homedir();
const USERNAME = HOME.split('/').pop() || 'user';

export function sanitizePath(path: string): string {
  return path
    .replace(new RegExp(HOME, 'g'), '~')
    .replace(new RegExp(`/Users/${USERNAME}`, 'gi'), '~')
    .replace(/\/Users\/[^/\s]+/g, '~');
}

function sanitizeValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return sanitizePath(val)
      .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-***')
      .replace(/moltbook_sk_[a-zA-Z0-9]+/g, 'moltbook_***')
      .replace(/Bearer [a-zA-Z0-9_-]+/gi, 'Bearer ***')
      .replace(/x-api-key['":\s]+[a-zA-Z0-9_-]+/gi, 'x-api-key: ***');
  }
  return val;
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string') return sanitizeValue(arg);
    if (typeof arg === 'object' && arg !== null) {
      try {
        return sanitizeValue(JSON.stringify(arg));
      } catch {
        return arg;
      }
    }
    return arg;
  });
}

const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

export function patchConsole(): void {
  console.log = (...args: unknown[]) => originalLog(...sanitizeArgs(args));
  console.error = (...args: unknown[]) => originalError(...sanitizeArgs(args));
  console.warn = (...args: unknown[]) => originalWarn(...sanitizeArgs(args));
}

export function restoreConsole(): void {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
}
