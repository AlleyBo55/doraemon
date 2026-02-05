/**
 * Coding Activity Buffer
 * 
 * Stores recent editor activity for the experience system to process.
 * Acts as a bridge between real-time editor watcher and the 50-minute heartbeat.
 * Tracks cumulative session time across the day.
 */

export type BufferedActivity = {
  editor: string;
  action: string;
  file?: string;
  language?: string;
  fileType?: string;
  timestamp: number;
};

export type CodingSessionStats = {
  totalActivities: number;
  filesEdited: string[];
  languagesUsed: string[];
  commitCount: number;
  codingMinutes: number;
  totalSessionMinutes: number;
  lastActivityTime: number;
  dominantLanguage: string | null;
  dominantFileType: string | null;
};

class CodingActivityBuffer {
  private activities: BufferedActivity[] = [];
  private maxAge = 24 * 60 * 60 * 1000; // 24 hours for cumulative tracking
  private maxSize = 2000;
  private sessionStartTime: number | null = null;
  private totalCodingMs = 0;
  private lastActivityTimestamp = 0;
  private readonly GAP_THRESHOLD = 15 * 60 * 1000; // 15 min gap = new session

  add(activity: BufferedActivity): void {
    const now = activity.timestamp;
    
    // Track cumulative session time
    if (this.lastActivityTimestamp > 0) {
      const gap = now - this.lastActivityTimestamp;
      if (gap < this.GAP_THRESHOLD) {
        // Continue session - add the gap time
        this.totalCodingMs += gap;
      } else {
        // Gap too large - this is a new session segment
        // Don't add the gap, just continue from here
      }
    }
    
    if (!this.sessionStartTime) {
      this.sessionStartTime = now;
    }
    
    this.lastActivityTimestamp = now;
    this.activities.push(activity);
    this.cleanup();
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.maxAge;
    this.activities = this.activities
      .filter(a => a.timestamp > cutoff)
      .slice(-this.maxSize);
  }

  getActivitiesSince(timestamp: number): BufferedActivity[] {
    return this.activities.filter(a => a.timestamp > timestamp);
  }

  getSessionStats(windowMinutes: number = 50): CodingSessionStats {
    const cutoff = Date.now() - (windowMinutes * 60 * 1000);
    const recent = this.activities.filter(a => a.timestamp > cutoff);

    const filesEdited = [...new Set(recent.filter(a => a.file).map(a => a.file!))];
    const languagesUsed = [...new Set(recent.filter(a => a.language).map(a => a.language!))];
    const commitCount = recent.filter(a => a.action === 'git_commit').length;

    // Calculate coding minutes for the window (first to last activity)
    let codingMinutes = 0;
    if (recent.length > 1) {
      const sorted = recent.sort((a, b) => a.timestamp - b.timestamp);
      const firstActivity = sorted[0].timestamp;
      const lastActivity = sorted[sorted.length - 1].timestamp;
      codingMinutes = (lastActivity - firstActivity) / 60000;
    } else if (recent.length === 1) {
      codingMinutes = 1;
    }

    // Find dominant language
    const langCounts = new Map<string, number>();
    for (const a of recent) {
      if (a.language) {
        langCounts.set(a.language, (langCounts.get(a.language) || 0) + 1);
      }
    }
    const dominantLanguage = langCounts.size > 0
      ? [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    // Find dominant file type
    const typeCounts = new Map<string, number>();
    for (const a of recent) {
      if (a.fileType) {
        typeCounts.set(a.fileType, (typeCounts.get(a.fileType) || 0) + 1);
      }
    }
    const dominantFileType = typeCounts.size > 0
      ? [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    return {
      totalActivities: recent.length,
      filesEdited,
      languagesUsed,
      commitCount,
      codingMinutes: Math.round(codingMinutes),
      totalSessionMinutes: Math.round(this.totalCodingMs / 60000),
      lastActivityTime: recent.length > 0 ? recent[recent.length - 1].timestamp : 0,
      dominantLanguage,
      dominantFileType,
    };
  }

  getTotalSessionMinutes(): number {
    return Math.round(this.totalCodingMs / 60000);
  }

  resetDailyStats(): void {
    this.totalCodingMs = 0;
    this.sessionStartTime = null;
    this.lastActivityTimestamp = 0;
  }

  clear(): void {
    this.activities = [];
    this.resetDailyStats();
  }
}

export const codingActivityBuffer = new CodingActivityBuffer();
