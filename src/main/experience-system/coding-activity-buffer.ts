/**
 * Coding Activity Buffer
 * 
 * Stores recent editor activity for the experience system to process.
 * Acts as a bridge between real-time editor watcher and the 50-minute heartbeat.
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
  lastActivityTime: number;
  dominantLanguage: string | null;
  dominantFileType: string | null;
};

class CodingActivityBuffer {
  private activities: BufferedActivity[] = [];
  private maxAge = 60 * 60 * 1000; // 1 hour
  private maxSize = 500;

  add(activity: BufferedActivity): void {
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

    // Calculate coding minutes as span from first to last activity
    // This better represents actual session time vs gap-based calculation
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
      lastActivityTime: recent.length > 0 ? recent[recent.length - 1].timestamp : 0,
      dominantLanguage,
      dominantFileType,
    };
  }

  clear(): void {
    this.activities = [];
  }
}

export const codingActivityBuffer = new CodingActivityBuffer();
