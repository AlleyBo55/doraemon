import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const DEFAULT_OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const DEFAULT_CONFIG_FILE = 'openclaw.json';
const DEFAULT_GATEWAY_PORT = 18790;
const KIRO_PROFILE_KEY = 'kiro:default';

const KIRO_ORCHESTRATOR_MODEL = 'anthropic/claude-opus-4-6';
const KIRO_RESPONDER_MODEL = 'anthropic/claude-haiku-4-5';

export class OpenClawNotInstalled extends Error {
  constructor(public readonly configPath: string) {
    super(`OpenClaw config not found at ${configPath}`);
    this.name = 'OpenClawNotInstalled';
  }
}

export class OpenClawConfigInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenClawConfigInvalid';
  }
}

export class OpenClawNoBackup extends Error {
  constructor(public readonly configPath: string) {
    super(`No Doraemon backup found alongside ${configPath}`);
    this.name = 'OpenClawNoBackup';
  }
}

interface AgentEntry {
  name?: string;
  model?: string;
  [key: string]: unknown;
}

interface ModelDefaults {
  primary?: string;
  [key: string]: unknown;
}

interface AgentDefaults {
  model?: ModelDefaults;
  [key: string]: unknown;
}

interface AgentsBlock {
  defaults?: AgentDefaults;
  list?: AgentEntry[];
  [key: string]: unknown;
}

interface AuthProfile {
  provider?: string;
  mode?: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
}

interface AuthBlock {
  profiles?: Record<string, AuthProfile>;
  [key: string]: unknown;
}

interface OpenClawConfig {
  auth?: AuthBlock;
  agents?: AgentsBlock;
  [key: string]: unknown;
}

export interface ConfigureKiroInput {
  port?: number;
  token: string;
  configDir?: string;
}

export interface ConfigureKiroResult {
  configPath: string;
  backupPath: string;
  rewroteAgents: number;
}

function getDefaultConfigPath(dir?: string): string {
  return path.join(dir ?? DEFAULT_OPENCLAW_DIR, DEFAULT_CONFIG_FILE);
}

async function readConfig(configPath: string): Promise<OpenClawConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OpenClawNotInstalled(configPath);
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new OpenClawConfigInvalid(
      `openclaw.json is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new OpenClawConfigInvalid('openclaw.json must be a JSON object');
  }
  const cfg = parsed as OpenClawConfig;
  if (typeof cfg.auth !== 'object' || cfg.auth === null) {
    throw new OpenClawConfigInvalid('openclaw.json missing auth block');
  }
  if (typeof cfg.auth.profiles !== 'object' || cfg.auth.profiles === null) {
    throw new OpenClawConfigInvalid('openclaw.json missing auth.profiles');
  }
  if (typeof cfg.agents !== 'object' || cfg.agents === null) {
    throw new OpenClawConfigInvalid('openclaw.json missing agents block');
  }
  return cfg;
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.doraemon-tmp-${Date.now()}`;
  await fs.writeFile(tmp, contents, 'utf-8');
  await fs.rename(tmp, filePath);
}

function backupName(configPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${configPath}.doraemon-backup-${stamp}`;
}

export async function configureOpenClawForKiro(
  input: ConfigureKiroInput,
): Promise<ConfigureKiroResult> {
  const port = input.port ?? DEFAULT_GATEWAY_PORT;
  const token = input.token;
  if (!token || token.length < 8) {
    throw new Error('configureOpenClawForKiro: token must be at least 8 chars');
  }

  const configPath = getDefaultConfigPath(input.configDir);
  const original = await readConfig(configPath);
  const originalRaw = JSON.stringify(original, null, 2) + '\n';

  const backupPath = backupName(configPath);
  await fs.writeFile(backupPath, originalRaw, 'utf-8');

  const next: OpenClawConfig = JSON.parse(JSON.stringify(original));
  const auth = next.auth as AuthBlock;
  const profiles = auth.profiles as Record<string, AuthProfile>;
  profiles[KIRO_PROFILE_KEY] = {
    provider: 'anthropic',
    mode: 'api_key',
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: token,
  };

  const agents = next.agents as AgentsBlock;
  if (!agents.defaults) agents.defaults = {};
  if (!agents.defaults.model) agents.defaults.model = {};
  const modelDefaults = agents.defaults.model;
  modelDefaults.primary = KIRO_ORCHESTRATOR_MODEL;

  let rewroteAgents = 0;
  if (Array.isArray(agents.list)) {
    for (const agent of agents.list) {
      // The "main" agent is the user-facing orchestrator; everyone else is a
      // worker. Match the two-tier model split here.
      const targetModel =
        agent.name === 'main' ? KIRO_ORCHESTRATOR_MODEL : KIRO_RESPONDER_MODEL;
      if (agent.model !== targetModel) {
        agent.model = targetModel;
        rewroteAgents += 1;
      }
    }
  }

  const nextRaw = JSON.stringify(next, null, 2) + '\n';
  try {
    await writeAtomic(configPath, nextRaw);
  } catch (err) {
    try {
      await writeAtomic(configPath, originalRaw);
    } catch (restoreErr) {
      console.error('[OpenClawConfigurator] failed to restore after error:', restoreErr);
    }
    throw err;
  }

  return { configPath, backupPath, rewroteAgents };
}

async function findLatestBackup(configPath: string): Promise<string | null> {
  const dir = path.dirname(configPath);
  const baseName = path.basename(configPath);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const prefix = `${baseName}.doraemon-backup-`;
  const matches = entries.filter((name) => name.startsWith(prefix)).sort();
  if (matches.length === 0) return null;
  const latest = matches[matches.length - 1];
  if (!latest) return null;
  return path.join(dir, latest);
}

export async function revertOpenClawConfig(
  input?: { configDir?: string },
): Promise<{ configPath: string; restoredFrom: string }> {
  const configPath = getDefaultConfigPath(input?.configDir);
  const backup = await findLatestBackup(configPath);
  if (!backup) throw new OpenClawNoBackup(configPath);
  const raw = await fs.readFile(backup, 'utf-8');
  await writeAtomic(configPath, raw);
  return { configPath, restoredFrom: backup };
}

export async function isOpenClawInstalled(input?: {
  configDir?: string;
}): Promise<boolean> {
  const configPath = getDefaultConfigPath(input?.configDir);
  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

export const __test__ = {
  getDefaultConfigPath,
  findLatestBackup,
};
