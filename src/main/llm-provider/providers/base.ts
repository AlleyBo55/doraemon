import type {
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  ProviderStatus,
} from '../types.js';

export type {
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  ProviderStatus,
};

export interface Provider {
  info: ProviderInfo;
  detect(): Promise<ProviderStatus>;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  streamChat?(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}
