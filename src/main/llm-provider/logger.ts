import type { ProviderName } from './types.js';

export interface LLMLogEvent {
  provider: ProviderName;
  model?: string;
  path: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
}

const MAX_FIELD_LEN = 200;

function clip(value: string): string {
  if (value.length <= MAX_FIELD_LEN) return value;
  return `${value.slice(0, MAX_FIELD_LEN)}…`;
}

function fmt(key: string, value: string | number | boolean | undefined): string {
  if (value === undefined) return '';
  const s = typeof value === 'string' ? clip(value) : String(value);
  return ` ${key}=${s.includes(' ') ? `"${s.replace(/"/g, '\\"')}"` : s}`;
}

export function logLLMCall(evt: LLMLogEvent): void {
  const parts =
    `[llm]` +
    fmt('provider', evt.provider) +
    fmt('model', evt.model) +
    fmt('path', evt.path) +
    fmt('input', evt.inputTokens) +
    fmt('output', evt.outputTokens) +
    fmt('ms', evt.durationMs) +
    fmt('ok', evt.ok) +
    fmt('err', evt.errorMessage);

  if (evt.ok) {
    console.log(parts);
  } else {
    console.warn(parts);
  }
}
