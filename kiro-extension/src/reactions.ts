import codingThoughts from '../../src/renderer/core/constants/coding-thoughts.json';
import type { EmotionType } from './protocol';

export type ActivityKind =
  // editing
  | 'typing'
  | 'saved'
  | 'switchedFile'
  | 'readingCode'
  | 'fileCreated'
  | 'fileDeleted'
  | 'fileRenamed'
  // correctness
  | 'errorsAppeared'
  | 'errorsCleared'
  | 'projectClean'
  // debugging
  | 'debugStarted'
  | 'debugStopped'
  | 'breakpointsChanged'
  // terminal and tasks
  | 'terminalOpened'
  | 'terminalCommand'
  | 'terminalFailed'
  | 'taskStarted'
  | 'taskSucceeded'
  | 'taskFailed'
  // source control
  | 'gitCommit'
  | 'gitBranchSwitch'
  | 'gitConflict'
  // Kiro agent lifecycle, reported by hooks
  | 'agentThinking'
  | 'agentWorking'
  | 'agentAwaitingConfirmation'
  | 'agentDone'
  | 'agentFailed'
  // presence
  | 'windowFocused'
  | 'windowBlurred'
  | 'idle'
  | 'breakReminder'
  | 'poked'
  | 'idleThought';

export type Reaction = {
  emotion: EmotionType;
  animation: string | null;
  thought: string | null;
  durationMs: number;
};

export type ActivityDetail = {
  language?: string;
  errorCount?: number;
  minutes?: number;
  thought?: string;
  command?: string;
  taskName?: string;
  branch?: string;
  fileName?: string;
  count?: number;
  /** Summary supplied by a Kiro hook. */
  message?: string;
};

/** Reactions that should stay on screen until the agent moves on. */
const AGENT_HOLD_MS = 30_000;
const CONFIRM_HOLD_MS = 5 * 60_000;

const pick = <T>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)] as T;

type CodingPool = keyof typeof codingThoughts;

/** Draws from the shared coding thought pools so lines do not repeat quickly. */
const fromPool = (name: CodingPool): string | null => {
  const pool = codingThoughts[name] as string[] | undefined;
  return pool && pool.length > 0 ? pick(pool) : null;
};

/**
 * The `languages` pool is keyed by language, so it has to be matched rather than
 * sampled, otherwise Doraemon says "TypeScript, is it? CSS styles~".
 * Matches the leading token exactly so "C" never collides with "C++".
 */
const lineForLanguage = (label: string): string | null => {
  const pool = codingThoughts.languages as string[] | undefined;
  if (!pool) return null;

  const matches = pool.filter((line) => line.split(' ')[0] === label);
  return matches.length > 0 ? pick(matches) : null;
};

/** Friendly names for the languages worth calling out by name. */
const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  typescriptreact: 'TSX',
  javascript: 'JavaScript',
  javascriptreact: 'JSX',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  sql: 'SQL',
  shellscript: 'shell script',
  yaml: 'YAML',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  vue: 'Vue',
  svelte: 'Svelte',
};

export const languageLabel = (languageId: string): string =>
  LANGUAGE_LABELS[languageId] ?? languageId;

const CLEARED_THOUGHTS = [
  'All clear! I knew you had it.',
  'No more errors~ Yatta!',
  'Clean file. Beautiful.',
  'You fixed it! I am so proud.',
] as const;

const IDLE_THOUGHTS = [
  'Taking a little break? Good idea.',
  'I will keep an eye on things.',
  'Zzz... oh! You are back?',
  'The cursor has not moved in a while~',
] as const;

const POKE_THOUGHTS = [
  'Hehe, that tickles!',
  'Yes? Did you need a gadget?',
  'Careful, I am delicate!',
  'Mou~ do not throw me around.',
] as const;

const WELCOME_BACK = [
  'Welcome back~',
  'Oh! You returned.',
  'I kept your seat warm.',
] as const;

type CommandReading = { label: string; emotion: EmotionType; animation?: string };

/** Recognises common command families so the terminal reaction reads sensibly. */
function describeCommand(command: string): CommandReading {
  const text = command.trim().toLowerCase();

  if (/^(npm|yarn|pnpm|bun)\s+(run\s+)?(test|t)\b/.test(text) || /\b(vitest|jest|pytest|go test|cargo test)\b/.test(text)) {
    return { label: 'Tests running~ fingers crossed.', emotion: 'concern' };
  }
  if (/\b(build|compile|tsc|webpack|vite build|cargo build|make)\b/.test(text)) {
    return { label: 'Building~ I love this part.', emotion: 'focus' };
  }
  if (/^git\s+push/.test(text) || /\b(deploy|publish|vercel|netlify|fly deploy)\b/.test(text)) {
    // Shipping something outward, so the take-copter comes out.
    return {
      label: 'Off it goes! Take-copter time~',
      emotion: 'excitement',
      animation: 'action_take_copter',
    };
  }
  if (/^git\s+(pull|fetch)/.test(text)) {
    return { label: 'Fetching what everyone else did.', emotion: 'curiosity' };
  }
  if (/^(npm|yarn|pnpm|bun)\s+(i|install|add)\b/.test(text) || /\bpip install\b/.test(text)) {
    return { label: 'More dependencies~ hope they behave.', emotion: 'contemplation' };
  }
  if (/^(rm|del)\s+-?r?f?/.test(text)) {
    return { label: 'Careful with that one!', emotion: 'concern' };
  }
  if (/\b(docker|kubectl|terraform)\b/.test(text)) {
    return { label: 'Infrastructure things. Very grown up.', emotion: 'determination' };
  }

  return { label: fromPool('tools') ?? 'Working the terminal~', emotion: 'focus' };
}

/**
 * Maps an observed IDE activity to a mascot reaction.
 * Deliberately offline: every line comes from a local pool, no model calls.
 */
export function reactTo(kind: ActivityKind, context: ActivityDetail = {}): Reaction {
  switch (kind) {
    /* ── editing ──────────────────────────────────────────────────────── */

    case 'typing':
      return {
        emotion: 'focus',
        animation: 'action_coding_typing',
        thought: fromPool(Math.random() > 0.5 ? 'general' : 'progress'),
        durationMs: 6000,
      };

    case 'saved':
      return {
        emotion: 'satisfaction',
        animation: 'emotion_satisfaction',
        thought: fromPool('progress'),
        durationMs: 5000,
      };

    case 'switchedFile': {
      const label = context.language ? languageLabel(context.language) : null;
      if (!label) {
        return {
          emotion: 'curiosity',
          animation: 'action_gadget_search',
          thought: 'A new file to explore~',
          durationMs: 5500,
        };
      }
      return {
        emotion: 'curiosity',
        animation: 'action_gadget_search',
        thought: lineForLanguage(label) ?? `${label}, is it? Let me have a look~`,
        durationMs: 5500,
      };
    }

    case 'readingCode':
      // Reading rather than writing, so he researches instead of typing.
      return {
        emotion: 'contemplation',
        animation: 'action_research',
        thought: fromPool('thinking'),
        durationMs: 6000,
      };

    case 'fileCreated':
      return {
        emotion: 'excitement',
        animation: 'action_gadget_surprise',
        thought: context.fileName
          ? `A brand new ${context.fileName}~ exciting!`
          : 'Something new appeared~',
        durationMs: 5000,
      };

    case 'fileDeleted':
      return {
        emotion: 'melancholy',
        animation: 'emotion_melancholy',
        thought: context.fileName
          ? `Goodbye, ${context.fileName}. You served well.`
          : 'Something is gone now.',
        durationMs: 5000,
      };

    case 'fileRenamed':
      return {
        emotion: 'wonder',
        animation: 'emotion_wonder',
        thought: 'A new name! I will try to remember it.',
        durationMs: 4500,
      };

    /* ── correctness ──────────────────────────────────────────────────── */

    case 'errorsAppeared': {
      // A ladder rather than a switch: puzzled, then worried, then fed up.
      const count = context.errorCount ?? 1;

      if (count >= 5) {
        return {
          emotion: 'frustration',
          animation: 'emotion_frustration',
          thought: `${count} errors! Deep breath, we will get through them.`,
          durationMs: 6500,
        };
      }
      if (count >= 3) {
        return {
          emotion: 'concern',
          animation: 'emotion_concern',
          thought: fromPool('debugging'),
          durationMs: 6500,
        };
      }
      return {
        emotion: 'confusion',
        animation: 'emotion_confusion',
        thought: fromPool('debugging'),
        durationMs: 6000,
      };
    }

    case 'errorsCleared':
      return {
        emotion: 'pride',
        animation: 'emotion_pride',
        thought: pick(CLEARED_THOUGHTS),
        durationMs: 6000,
      };

    case 'projectClean':
      // The whole workspace going green deserves more than mild satisfaction.
      return {
        emotion: 'awe',
        animation: 'emotion_awe',
        thought: 'Not a single error in the whole project. Look at you.',
        durationMs: 7000,
      };

    /* ── debugging ────────────────────────────────────────────────────── */

    case 'debugStarted':
      return {
        emotion: 'determination',
        animation: 'emotion_determination',
        thought: fromPool('debugging'),
        durationMs: 6000,
      };

    case 'debugStopped':
      return {
        emotion: 'contemplation',
        animation: 'action_coding_thinking',
        thought: fromPool('thinking'),
        durationMs: 5000,
      };

    case 'breakpointsChanged':
      return {
        emotion: 'curiosity',
        animation: 'action_gadget_use',
        thought: 'A breakpoint~ we will catch it in the act.',
        durationMs: 4500,
      };

    /* ── terminal and tasks ───────────────────────────────────────────── */

    case 'terminalOpened':
      return {
        emotion: 'curiosity',
        animation: 'action_gadget_search',
        thought: 'A terminal! Now we are serious.',
        durationMs: 4500,
      };

    case 'terminalCommand': {
      const described = describeCommand(context.command ?? '');
      return {
        emotion: described.emotion,
        animation: described.animation ?? 'action_coding_typing',
        thought: described.label,
        durationMs: 6000,
      };
    }

    case 'terminalFailed':
      // A command exiting non-zero is the one thing he is allowed to be cross about.
      return {
        emotion: 'frustration',
        animation: 'action_angry',
        thought: `That command did not end well. ${fromPool('debugging') ?? ''}`.trim(),
        durationMs: 7000,
      };

    case 'taskStarted':
      // Hoping it passes, before we know either way.
      return {
        emotion: 'hope',
        animation: 'emotion_hope',
        thought: context.taskName ? `Running "${context.taskName}"~` : 'A task is running~',
        durationMs: 5500,
      };

    case 'taskSucceeded':
      // Reporting the good news back to you.
      return {
        emotion: 'joy',
        animation: 'action_chat_answer',
        thought: context.taskName
          ? `"${context.taskName}" passed! ${fromPool('progress') ?? ''}`.trim()
          : (fromPool('progress') ?? 'It worked!'),
        durationMs: 6500,
      };

    case 'taskFailed':
      return {
        emotion: 'concern',
        animation: 'emotion_concern',
        thought: context.taskName
          ? `"${context.taskName}" failed. Shall we look together?`
          : 'That did not pass. We will fix it.',
        durationMs: 7000,
      };

    /* ── source control ───────────────────────────────────────────────── */

    case 'gitCommit':
      return {
        emotion: 'pride',
        animation: 'emotion_pride',
        thought: `Committed! ${fromPool('motivation') ?? 'Progress is progress.'}`,
        durationMs: 7000,
      };

    case 'gitBranchSwitch':
      return {
        emotion: 'wonder',
        animation: 'action_time_travel',
        thought: context.branch
          ? `Off to "${context.branch}"~ like a little time machine.`
          : 'A different branch~ hold on tight.',
        durationMs: 6000,
      };

    case 'gitConflict':
      return {
        emotion: 'concern',
        animation: 'action_protect',
        thought: 'Merge conflicts. Take it slowly, I am right here.',
        durationMs: 8000,
      };

    /* ── Kiro agent lifecycle ─────────────────────────────────────────── */

    case 'agentThinking':
      return {
        emotion: 'contemplation',
        animation: 'action_coding_thinking',
        thought: context.message ?? 'Kiro is thinking~',
        durationMs: AGENT_HOLD_MS,
      };

    case 'agentWorking':
      return {
        emotion: 'focus',
        animation: 'action_coding_typing',
        thought: context.message ?? (context.taskName ? `Running ${context.taskName}~` : 'Kiro is working~'),
        durationMs: AGENT_HOLD_MS,
      };

    case 'agentAwaitingConfirmation':
      return {
        emotion: 'concern',
        animation: 'action_chat_question',
        // Long hold: this is the one message you must not miss while away.
        thought: context.message ?? 'Kiro needs your approval. Click me to go there.',
        durationMs: CONFIRM_HOLD_MS,
      };

    case 'agentDone':
      // Presenting the result, gadget-explanation style.
      return {
        emotion: 'gratitude',
        animation: 'action_explain_gadget',
        thought: context.message ?? 'All done! Click me to see.',
        durationMs: AGENT_HOLD_MS,
      };

    case 'agentFailed':
      return {
        emotion: 'frustration',
        animation: 'emotion_frustration',
        thought: context.message ?? 'That did not go well. Click me to look.',
        durationMs: AGENT_HOLD_MS,
      };

    /* ── presence ─────────────────────────────────────────────────────── */

    case 'windowFocused':
      return {
        emotion: 'connection',
        animation: 'action_greeting',
        thought: pick(WELCOME_BACK),
        durationMs: 4000,
      };

    case 'windowBlurred':
      // You left, so he wanders off and misses you. Silently.
      return {
        emotion: 'longing',
        animation: 'action_walk',
        thought: null,
        durationMs: 4000,
      };

    case 'idle':
      return {
        emotion: 'fatigue',
        animation: Math.random() > 0.5 ? 'action_nap' : 'action_rest',
        thought: pick(IDLE_THOUGHTS),
        durationMs: 8000,
      };

    case 'breakReminder': {
      const minutes = context.minutes ?? 60;
      // Suggesting a break lands better with a dorayaki in hand, or asking for one.
      return {
        emotion: 'concern',
        animation: Math.random() > 0.5 ? 'action_eating' : 'action_hungry',
        thought: `${minutes} minutes straight. ${fromPool('motivation') ?? 'Stretch a little?'}`,
        durationMs: 10000,
      };
    }

    case 'poked':
      return {
        emotion: 'playful',
        animation: 'action_random_thought',
        thought: pick(POKE_THOUGHTS),
        durationMs: 4000,
      };

    case 'idleThought':
      return {
        emotion: 'calm',
        animation: null,
        thought: context.thought ?? null,
        durationMs: 6500,
      };
  }
}
