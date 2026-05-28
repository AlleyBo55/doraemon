import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type {
  ChatMessage,
  ChatOptions,
  Provider,
  ProviderInfo,
  ProviderStatus,
} from './base.js';
import { kiroChat, KiroRequestError } from './kiro/client.js';
import { KiroAuthExpired, KiroAuthNetwork } from './kiro/auth.js';

const INFO: ProviderInfo = {
  name: 'kiro',
  displayName: 'Kiro IDE',
  description:
    'Routes through your logged-in Kiro IDE session on this machine. No keys, no extra cost beyond what Kiro already covers.',
  costNote: 'free (uses your Kiro session)',
};

const KIRO_CRED_PATHS = [
  path.join(os.homedir(), '.aws', 'sso', 'cache', 'kiro-auth-token.json'),
  path.join(os.homedir(), '.local', 'share', 'kiro-cli', 'data.sqlite3'),
  path.join(os.homedir(), '.local', 'share', 'amazon-q', 'data.sqlite3'),
];

async function findReadableCredPath(): Promise<string | null> {
  for (const candidate of KIRO_CRED_PATHS) {
    try {
      await fs.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

function shorten(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? p.replace(home, '~') : p;
}

function lastUserMessage(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > 0 && messages[messages.length - 1]!.role === 'user') {
    return messages;
  }
  return [...messages, { role: 'user', content: '' }];
}

export const kiroProvider: Provider = {
  info: INFO,

  async detect(): Promise<ProviderStatus> {
    const credPath = await findReadableCredPath();
    if (!credPath) {
      return {
        info: INFO,
        available: false,
        reason: 'no Kiro credentials found in ~/.aws/sso/cache or ~/.local/share',
      };
    }
    return {
      info: INFO,
      available: true,
      metadata: { credPath: shorten(credPath) },
    };
  },

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    try {
      const result = await kiroChat({
        ...(opts?.model ? { model: opts.model } : {}),
        ...(opts?.systemPrompt ? { system: opts.systemPrompt } : {}),
        ...(typeof opts?.maxTokens === 'number' ? { maxTokens: opts.maxTokens } : {}),
        ...(typeof opts?.temperature === 'number' ? { temperature: opts.temperature } : {}),
        messages: lastUserMessage(messages),
      });
      return result.text;
    } catch (err) {
      if (err instanceof KiroAuthExpired) {
        throw new Error(`Kiro session expired — log in to Kiro IDE again. (${err.message})`);
      }
      if (err instanceof KiroAuthNetwork) {
        throw new Error(`Kiro auth refresh failed: ${err.message}`);
      }
      if (err instanceof KiroRequestError) {
        throw new Error(`Kiro request failed: ${err.message}`);
      }
      throw err;
    }
  },
};
