import type { EmotionType } from '../../src/renderer/core/types/emotion';

export type { EmotionType };

/** Sent from the extension host into the webview. */
export type HostMessage =
  | { type: 'init'; spriteBase: string; showThoughts: boolean }
  | { type: 'config'; showThoughts: boolean }
  | { type: 'resetPosition' }
  | {
      type: 'react';
      emotion: EmotionType;
      /** Sprite animation to hold, or null to let the engine pick its own. */
      animation: string | null;
      thought: string | null;
      durationMs: number;
    };

/** Sent from the webview back to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'poked' };
