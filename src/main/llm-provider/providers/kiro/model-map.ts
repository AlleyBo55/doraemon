interface ModelEntry {
  kiroId: string;
  aliases: readonly string[];
}

// Identifiers come from GET /ListAvailableModels?origin=AI_EDITOR on the
// CodeWhisperer endpoint. They use dot-notation (e.g. "claude-opus-4.7"),
// not the CLAUDE_OPUS_X_X_VX_X form bundled in the IDE source.
const ENTRIES: readonly ModelEntry[] = [
  {
    kiroId: 'claude-opus-4.7',
    aliases: [
      'claude-opus-4-7',
      'kiro/claude-opus-4-7',
      'kiro/claude-opus-4.7',
      'opus',
      'opus47',
      'opus-latest',
      // OpenClaw's registry tops out at 4-6 today; route it to the latest Opus.
      'claude-opus-4-6',
      'anthropic/claude-opus-4-6',
      'opus46',
    ],
  },
  {
    kiroId: 'claude-opus-4.6',
    aliases: ['claude-opus-4-6-pinned', 'opus46-pinned'],
  },
  {
    kiroId: 'claude-opus-4.5',
    aliases: ['claude-opus-4-5', 'kiro/claude-opus-4-5', 'opus45'],
  },
  {
    kiroId: 'claude-sonnet-4.6',
    aliases: ['claude-sonnet-4-6', 'kiro/claude-sonnet-4-6', 'sonnet46', 'sonnet'],
  },
  {
    kiroId: 'claude-sonnet-4.5',
    aliases: ['claude-sonnet-4-5', 'kiro/claude-sonnet-4-5', 'sonnet45'],
  },
  {
    kiroId: 'claude-sonnet-4',
    aliases: ['claude-sonnet-4-20250514', 'kiro/claude-sonnet-4', 'sonnet4'],
  },
  {
    kiroId: 'claude-haiku-4.5',
    aliases: [
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'kiro/claude-haiku-4-5',
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-haiku-4-5-20251001',
      'haiku',
      'haiku45',
      'haiku35',
      'claude-3-haiku-20240307',
      'claude-3-5-haiku-20241022',
      'CLAUDE_HAIKU_4_5_20251001_V1_0',
      'CLAUDE_HAIKU_4_5_V1_0',
    ],
  },
  {
    kiroId: 'auto',
    aliases: ['kiro/auto', 'auto-route'],
  },
];

const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const e of ENTRIES) {
    m.set(e.kiroId.toLowerCase(), e.kiroId);
    for (const alias of e.aliases) {
      m.set(alias.toLowerCase(), e.kiroId);
    }
  }
  return m;
})();

export const DEFAULT_KIRO_MODEL = 'claude-haiku-4.5';

export function resolveModel(input: string | undefined | null): string {
  if (!input) return DEFAULT_KIRO_MODEL;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return DEFAULT_KIRO_MODEL;
  return ALIAS_INDEX.get(trimmed) ?? DEFAULT_KIRO_MODEL;
}

export function listKnownModels(): string[] {
  return ENTRIES.map((e) => e.kiroId);
}
