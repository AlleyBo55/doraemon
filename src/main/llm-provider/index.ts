import {
  getStoredChoice,
  setStoredChoice,
  clearStoredChoice,
  generateGatewayToken,
  updateStoredChoice,
} from './store.js';
import {
  detectAll,
  detectProvider,
  getProvider,
  clearDetectionCache,
} from './detector.js';
import {
  configureOpenClawForKiro,
  revertOpenClawConfig,
  isOpenClawInstalled,
  OpenClawNotInstalled,
  OpenClawNoBackup,
  OpenClawConfigInvalid,
} from './openclaw-configurator.js';
import { startKiroGateway, stopKiroGateway, getGatewayInfo } from './http-gateway.js';
import type { Provider } from './providers/base.js';
import type {
  ChatMessage,
  ChatOptions,
  ProviderName,
  ProviderStatus,
  StoredChoice,
} from './types.js';

const KIRO_GATEWAY_DEFAULT_PORT = 18790;

export type {
  ChatMessage,
  ChatOptions,
  Provider,
  ProviderName,
  ProviderStatus,
  StoredChoice,
};

export {
  detectAll,
  detectProvider,
  getProvider,
  clearDetectionCache,
  configureOpenClawForKiro,
  revertOpenClawConfig,
  isOpenClawInstalled,
  OpenClawNotInstalled,
  OpenClawNoBackup,
  OpenClawConfigInvalid,
  getStoredChoice,
  clearStoredChoice,
  startKiroGateway,
  stopKiroGateway,
  getGatewayInfo,
};

export async function getCurrentProvider(): Promise<ProviderName | null> {
  const stored = await getStoredChoice();
  return stored.provider;
}

export interface SwitchResult {
  provider: ProviderName;
  openClawConfigured?: boolean;
  openClawReverted?: boolean;
  openClawSkipped?: boolean;
  warnings?: string[];
}

async function ensureKiroGatewayCredentials(
  current: StoredChoice,
): Promise<{ token: string; port: number; updated?: StoredChoice }> {
  const port = current.kiroGatewayPort ?? KIRO_GATEWAY_DEFAULT_PORT;
  if (current.kiroGatewayToken) {
    return { token: current.kiroGatewayToken, port };
  }
  const token = generateGatewayToken();
  const updated = await updateStoredChoice({
    kiroGatewayToken: token,
    kiroGatewayPort: port,
  });
  return { token, port, updated };
}

async function applyOpenClawForKiro(
  warnings: string[],
): Promise<{ configured: boolean; skipped: boolean }> {
  const installed = await isOpenClawInstalled();
  if (!installed) {
    warnings.push('OpenClaw is not installed; skipped auto-config.');
    return { configured: false, skipped: true };
  }

  const stored = await getStoredChoice();
  const { token, port } = await ensureKiroGatewayCredentials(stored);
  try {
    await configureOpenClawForKiro({ token, port });
    return { configured: true, skipped: false };
  } catch (err) {
    if (err instanceof OpenClawNotInstalled) {
      warnings.push('OpenClaw config disappeared during configure.');
      return { configured: false, skipped: true };
    }
    if (err instanceof OpenClawConfigInvalid) {
      warnings.push(`OpenClaw config invalid: ${err.message}`);
      return { configured: false, skipped: true };
    }
    throw err;
  }
}

async function applyOpenClawRevert(warnings: string[]): Promise<boolean> {
  try {
    await revertOpenClawConfig();
    return true;
  } catch (err) {
    if (err instanceof OpenClawNoBackup) {
      warnings.push('No OpenClaw backup found to revert.');
      return false;
    }
    throw err;
  }
}

export async function switchProvider(provider: ProviderName): Promise<SwitchResult> {
  const previous = await getCurrentProvider();
  const warnings: string[] = [];
  let openClawConfigured: boolean | undefined;
  let openClawReverted: boolean | undefined;
  let openClawSkipped: boolean | undefined;

  if (provider === 'kiro') {
    const stored = await getStoredChoice();
    const { token, port } = await ensureKiroGatewayCredentials(stored);
    try {
      await startKiroGateway({ token, port });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      warnings.push(`Failed to start Kiro gateway on port ${port}: ${msg}`);
    }
    const result = await applyOpenClawForKiro(warnings);
    openClawConfigured = result.configured;
    openClawSkipped = result.skipped;
  } else if (previous === 'kiro') {
    try {
      await stopKiroGateway();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      warnings.push(`Failed to stop Kiro gateway: ${msg}`);
    }
    const installed = await isOpenClawInstalled();
    if (installed) {
      openClawReverted = await applyOpenClawRevert(warnings);
    }
  }

  await setStoredChoice(provider);
  clearDetectionCache();

  const out: SwitchResult = { provider };
  if (openClawConfigured !== undefined) out.openClawConfigured = openClawConfigured;
  if (openClawReverted !== undefined) out.openClawReverted = openClawReverted;
  if (openClawSkipped !== undefined) out.openClawSkipped = openClawSkipped;
  if (warnings.length > 0) out.warnings = warnings;
  return out;
}

/**
 * Called once at app start. If the user already chose Kiro previously, this
 * makes sure the local HTTP gateway is up so OpenClaw can reach it.
 */
export async function bootstrapProvider(): Promise<void> {
  const stored = await getStoredChoice();
  if (stored.provider !== 'kiro') return;
  const { token, port } = await ensureKiroGatewayCredentials(stored);
  try {
    await startKiroGateway({ token, port });
  } catch (err) {
    console.warn(
      '[llm-provider] failed to start Kiro gateway on boot:',
      err instanceof Error ? err.message : err,
    );
  }
}

interface PickerWaiter {
  resolve: (value: ProviderName) => void;
  reject: (err: Error) => void;
}

const pickerWaiters: PickerWaiter[] = [];

export function notifyPickerSelection(provider: ProviderName): void {
  while (pickerWaiters.length > 0) {
    const w = pickerWaiters.shift();
    if (w) w.resolve(provider);
  }
}

export function notifyPickerCancelled(): void {
  while (pickerWaiters.length > 0) {
    const w = pickerWaiters.shift();
    if (w) w.resolve('offline');
  }
}

export async function ensurePickerIfNoChoice(
  openPicker: () => Promise<void> | void,
): Promise<ProviderName> {
  const current = await getCurrentProvider();
  if (current) return current;

  await openPicker();
  return new Promise<ProviderName>((resolve, reject) => {
    pickerWaiters.push({ resolve, reject });
  });
}

export async function chatWithCurrent(
  messages: ChatMessage[],
  opts?: ChatOptions,
): Promise<string> {
  let provider = await getCurrentProvider();
  if (!provider) {
    // First-chat trigger: ask the user to pick before we send anything.
    const picker = pickerOpener;
    if (picker) {
      provider = await ensurePickerIfNoChoice(picker);
    } else {
      throw new Error('No LLM provider selected and no picker available');
    }
  }
  return getProvider(provider).chat(messages, opts);
}

let pickerOpener: (() => Promise<void> | void) | null = null;

export function setPickerOpener(opener: (() => Promise<void> | void) | null): void {
  pickerOpener = opener;
}
