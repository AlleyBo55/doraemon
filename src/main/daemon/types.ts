export type CheckStatus = 'pending' | 'checking' | 'success' | 'warning' | 'error';

export type NodeCheckResult = {
  installed: boolean;
  version: string | null;
  majorVersion: number | null;
  meetsRequirement: boolean;
  error?: string;
};

export type OpenClawCheckResult = {
  installed: boolean;
  version: string | null;
  path: string | null;
  error?: string;
};

export type PortCheckResult = {
  inUse: boolean;
  pid: number | null;
  processName: string | null;
  isOpenClaw: boolean;
  error?: string;
};

export type InstallResult = {
  success: boolean;
  error?: string;
  errorType?: 'sharp' | 'node-gyp' | 'permission' | 'network' | 'unknown';
  suggestion?: string;
  logs?: string;
};

export type StartDaemonResult = {
  success: boolean;
  pid?: number;
  error?: string;
  logs?: string;
};

export const REQUIRED_NODE_VERSION = 22;
export const DEFAULT_PORT = 18789;
