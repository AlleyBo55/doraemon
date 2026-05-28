import type { Provider, ProviderInfo, ProviderStatus } from './base.js';

const INFO: ProviderInfo = {
  name: 'offline',
  displayName: 'Offline',
  description:
    'No LLM. Doraemon still walks, reacts, and uses local persona snippets, but cannot answer questions.',
  costNote: 'no LLM',
};

export const offlineProvider: Provider = {
  info: INFO,

  async detect(): Promise<ProviderStatus> {
    return { info: INFO, available: true };
  },

  async chat(): Promise<string> {
    return '';
  },
};
