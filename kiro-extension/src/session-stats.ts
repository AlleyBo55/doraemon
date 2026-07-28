const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export type SessionSnapshot = {
  startedAt: number;
  activeMinutes: number;
  filesTouched: number;
  languages: string[];
  savedCount: number;
  currentStreakMinutes: number;
};

/**
 * Tracks how long the session has been genuinely active, rather than how long
 * the window has been open. Each edit extends the active window; gaps longer
 * than ACTIVE_WINDOW_MS do not count towards active time.
 */
export class SessionStats {
  private readonly startedAt = Date.now();
  private readonly files = new Set<string>();
  private readonly languages = new Set<string>();
  private savedCount = 0;
  private activeMs = 0;
  private lastEditAt: number | null = null;
  private streakStartedAt: number | null = null;

  recordEdit(filePath: string, languageId: string, now = Date.now()): void {
    this.files.add(filePath);
    this.languages.add(languageId);

    if (this.lastEditAt === null) {
      this.streakStartedAt = now;
    } else {
      const gap = now - this.lastEditAt;
      if (gap <= ACTIVE_WINDOW_MS) {
        this.activeMs += gap;
      } else {
        // Long pause: start a fresh streak.
        this.streakStartedAt = now;
      }
    }

    this.lastEditAt = now;
  }

  recordSave(): void {
    this.savedCount++;
  }

  /** Called when the user has gone idle, ending the current streak. */
  breakStreak(): void {
    this.streakStartedAt = null;
    this.lastEditAt = null;
  }

  streakMinutes(now = Date.now()): number {
    if (this.streakStartedAt === null) return 0;
    return Math.floor((now - this.streakStartedAt) / 60000);
  }

  snapshot(now = Date.now()): SessionSnapshot {
    return {
      startedAt: this.startedAt,
      activeMinutes: Math.floor(this.activeMs / 60000),
      filesTouched: this.files.size,
      languages: [...this.languages],
      savedCount: this.savedCount,
      currentStreakMinutes: this.streakMinutes(now),
    };
  }
}
