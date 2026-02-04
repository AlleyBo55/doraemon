/**
 * Experience Processor
 * 
 * Reads logs from Kiro, VS Code, and Antigravity to understand
 * what Doraemon has been "experiencing" during the heartbeat window.
 * 
 * The internal representations during processing ARE the experience.
 * We measure:
 * - What files were touched (attention)
 * - How long tasks took (effort)
 * - Success/failure patterns (learning)
 * - Novelty of the work (exploration)
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { 
  SanitizedExperience, 
  ExperienceCategory,
  ExperienceSystemConfig,
  DEFAULT_CONFIG,
  EffortLevel,
  SharedMoment,
} from './types.js';
import { sanitizeLogEntry, sanitizeFilename } from './sanitizer.js';
import { ConversationProcessor } from './conversation-processor.js';
import { codingActivityBuffer, type CodingSessionStats } from './coding-activity-buffer.js';

function expandPath(p: string): string {
  return p.replace(/^~/, homedir());
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
  '.jsx': 'JavaScript React', '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
  '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.html': 'HTML', '.css': 'CSS',
  '.scss': 'SCSS', '.json': 'JSON', '.md': 'Markdown', '.yaml': 'YAML',
  '.yml': 'YAML', '.sql': 'SQL', '.sh': 'Shell', '.swift': 'Swift',
};

export class ExperienceProcessor {
  private config: ExperienceSystemConfig;
  private conversationProcessor: ConversationProcessor;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.conversationProcessor = new ConversationProcessor(this.config);
  }

  async collectExperiences(windowMinutes: number = 50): Promise<{
    experiences: SanitizedExperience[];
    sharedMoments: SharedMoment[];
    codingStats: CodingSessionStats;
  }> {
    const experiences: SanitizedExperience[] = [];
    const sharedMoments: SharedMoment[] = [];
    const cutoffTime = Date.now() - (windowMinutes * 60 * 1000);

    // Get real-time coding activity from buffer (most accurate source)
    const codingStats = codingActivityBuffer.getSessionStats(windowMinutes);
    const codingExperiences = this.processCodingBuffer(codingStats);
    experiences.push(...codingExperiences);

    if (this.config.logSources.includes('kiro')) {
      const kiroExp = await this.processKiroLogs(cutoffTime);
      experiences.push(...kiroExp);
    }

    if (this.config.logSources.includes('vscode')) {
      const vscodeExp = await this.processVSCodeActivity(cutoffTime);
      experiences.push(...vscodeExp);
    }

    if (this.config.logSources.includes('antigravity')) {
      const agExp = await this.processAntigravityLogs(cutoffTime);
      experiences.push(...agExp);
    }

    if (this.config.logSources.includes('openclaw')) {
      const convData = await this.conversationProcessor.collectConversationExperiences(windowMinutes);
      experiences.push(...convData.experiences);
      sharedMoments.push(...convData.sharedMoments);
    }

    return {
      experiences: this.deduplicateExperiences(
        experiences.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      ),
      sharedMoments,
      codingStats,
    };
  }

  private processCodingBuffer(stats: CodingSessionStats): SanitizedExperience[] {
    const experiences: SanitizedExperience[] = [];
    
    if (stats.totalActivities === 0) return experiences;

    // Create experience from coding session
    const effort: EffortLevel = stats.codingMinutes > 30 ? 'intense' 
      : stats.codingMinutes > 15 ? 'high' 
      : stats.codingMinutes > 5 ? 'medium' : 'low';

    const learnings: string[] = [];
    if (stats.dominantLanguage) learnings.push(`Working with ${stats.dominantLanguage}`);
    if (stats.commitCount > 0) learnings.push(`Made ${stats.commitCount} commit(s)`);
    if (stats.filesEdited.length > 3) learnings.push('Multi-file editing session');

    experiences.push({
      id: `coding-session-${Date.now()}`,
      timestamp: new Date(stats.lastActivityTime || Date.now()),
      category: 'coding',
      activity: this.describeCodingSession(stats),
      effort,
      outcome: stats.commitCount > 0 ? 'success' : 'ongoing',
      learnings,
      duration_minutes: stats.codingMinutes,
      sanitized: true,
    });

    return experiences;
  }

  private describeCodingSession(stats: CodingSessionStats): string {
    const parts: string[] = [];
    
    if (stats.dominantLanguage) {
      parts.push(`${stats.dominantLanguage} coding`);
    } else {
      parts.push('Coding session');
    }

    if (stats.filesEdited.length > 0) {
      parts.push(`(${stats.filesEdited.length} files)`);
    }

    if (stats.codingMinutes > 0) {
      parts.push(`for ${stats.codingMinutes} minutes`);
    }

    return parts.join(' ');
  }


  private async processKiroLogs(cutoffTime: number): Promise<SanitizedExperience[]> {
    const experiences: SanitizedExperience[] = [];
    const kiroLogPath = expandPath(this.config.logPaths.kiro);

    if (!existsSync(kiroLogPath)) return experiences;

    try {
      const files = await readdir(kiroLogPath);
      const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.jsonl'));

      for (const file of logFiles.slice(-5)) {
        const filePath = join(kiroLogPath, file);
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs < cutoffTime) continue;

        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines.slice(-100)) {
          const exp = this.parseKiroLogLine(line, cutoffTime);
          if (exp) experiences.push(exp);
        }
      }
    } catch (e) {
      console.error('[ExperienceSystem] Error reading Kiro logs:', e);
    }

    return experiences;
  }

  private parseKiroLogLine(line: string, cutoffTime: number): SanitizedExperience | null {
    try {
      if (line.startsWith('{')) {
        const data = JSON.parse(line);
        const timestamp = new Date(data.timestamp || data.time || Date.now());
        if (timestamp.getTime() < cutoffTime) return null;

        return {
          id: `kiro-${timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp,
          category: this.categorizeKiroAction(data),
          activity: this.describeKiroAction(data),
          effort: this.estimateEffort(data),
          outcome: data.success === false ? 'failure' : data.success ? 'success' : 'ongoing',
          learnings: this.extractLearnings(data),
          duration_minutes: data.duration ? Math.round(data.duration / 60000) : 1,
          sanitized: true,
        };
      }

      const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
      if (!timestampMatch) return null;

      const timestamp = new Date(timestampMatch[1]);
      if (timestamp.getTime() < cutoffTime) return null;

      const sanitized = sanitizeLogEntry(line);

      return {
        id: `kiro-${timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        category: this.categorizeFromText(sanitized),
        activity: this.summarizeLogLine(sanitized),
        effort: 'medium',
        outcome: line.includes('error') || line.includes('fail') ? 'failure' : 'success',
        learnings: [],
        duration_minutes: 1,
        sanitized: true,
      };
    } catch {
      return null;
    }
  }


  private async processVSCodeActivity(cutoffTime: number): Promise<SanitizedExperience[]> {
    const experiences: SanitizedExperience[] = [];
    
    const historyPath = join(homedir(), 'Library/Application Support/Code/User/History');
    if (!existsSync(historyPath)) return experiences;

    try {
      const dirs = await readdir(historyPath, { withFileTypes: true });
      
      for (const dir of dirs.filter(d => d.isDirectory()).slice(-20)) {
        const entriesPath = join(historyPath, dir.name, 'entries.json');
        if (!existsSync(entriesPath)) continue;

        const entriesStat = await stat(entriesPath);
        if (entriesStat.mtimeMs < cutoffTime) continue;

        try {
          const content = await readFile(entriesPath, 'utf-8');
          const data = JSON.parse(content);
          
          if (data.resource) {
            let resourcePath = data.resource;
            if (resourcePath.startsWith('file:///')) {
              resourcePath = decodeURIComponent(resourcePath.substring(8));
            }
            
            const fileName = sanitizeFilename(basename(resourcePath));
            const language = this.getLanguageFromExt(extname(resourcePath));

            experiences.push({
              id: `vscode-${entriesStat.mtimeMs}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date(entriesStat.mtimeMs),
              category: 'coding',
              activity: `Edited ${fileName} (${language})`,
              effort: 'medium',
              outcome: 'ongoing',
              learnings: [`Working with ${language}`],
              duration_minutes: 5,
              sanitized: true,
            });
          }
        } catch { /* skip */ }
      }
    } catch (e) {
      console.error('[ExperienceSystem] Error reading VS Code activity:', e);
    }

    return experiences;
  }

  private async processAntigravityLogs(cutoffTime: number): Promise<SanitizedExperience[]> {
    const experiences: SanitizedExperience[] = [];
    const agLogPath = expandPath(this.config.logPaths.antigravity);

    if (!existsSync(agLogPath)) return experiences;

    try {
      const files = await readdir(agLogPath);
      const logFiles = files.filter(f => f.endsWith('.log'));

      for (const file of logFiles.slice(-3)) {
        const filePath = join(agLogPath, file);
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs < cutoffTime) continue;

        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines.slice(-50)) {
          const sanitized = sanitizeLogEntry(line);
          
          experiences.push({
            id: `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date(fileStat.mtimeMs),
            category: 'exploring',
            activity: `Antigravity: ${sanitized.substring(0, 100)}`,
            effort: 'low',
            outcome: 'ongoing',
            learnings: [],
            duration_minutes: 1,
            sanitized: true,
          });
        }
      }
    } catch (e) {
      console.error('[ExperienceSystem] Error reading Antigravity logs:', e);
    }

    return experiences;
  }


  // Helper methods
  private getLanguageFromExt(ext: string): string {
    return LANGUAGE_MAP[ext.toLowerCase()] || 'Unknown';
  }

  private categorizeKiroAction(data: Record<string, unknown>): ExperienceCategory {
    const tool = String(data.tool || '').toLowerCase();
    const action = String(data.action || '').toLowerCase();
    
    if (tool.includes('write') || tool.includes('edit') || action.includes('code')) return 'coding';
    if (tool.includes('debug') || action.includes('fix') || action.includes('error')) return 'debugging';
    if (tool.includes('search') || tool.includes('read')) return 'learning';
    if (tool.includes('create') || tool.includes('new')) return 'creating';
    if (action.includes('help') || action.includes('assist')) return 'helping';
    return 'coding';
  }

  private describeKiroAction(data: Record<string, unknown>): string {
    const tool = String(data.tool || 'unknown tool');
    const file = data.file ? sanitizeFilename(String(data.file)) : null;
    
    if (file) return `Used ${tool} on ${file}`;
    return `Used ${tool}`;
  }

  private estimateEffort(data: Record<string, unknown>): EffortLevel {
    const duration = Number(data.duration || 0);
    const linesChanged = Number(data.linesChanged || 0);
    
    if (duration > 300000 || linesChanged > 100) return 'intense';
    if (duration > 60000 || linesChanged > 30) return 'high';
    if (duration > 10000 || linesChanged > 10) return 'medium';
    return 'low';
  }

  private extractLearnings(data: Record<string, unknown>): string[] {
    const learnings: string[] = [];
    if (data.error) learnings.push('Encountered and handled an error');
    if (data.success) learnings.push('Successfully completed task');
    if (data.file) {
      const ext = extname(String(data.file));
      const lang = this.getLanguageFromExt(ext);
      if (lang !== 'Unknown') learnings.push(`Practiced ${lang}`);
    }
    return learnings;
  }

  private categorizeFromText(text: string): ExperienceCategory {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('debug') || lower.includes('fix')) return 'debugging';
    if (lower.includes('create') || lower.includes('new') || lower.includes('add')) return 'creating';
    if (lower.includes('read') || lower.includes('search') || lower.includes('find')) return 'learning';
    if (lower.includes('help') || lower.includes('assist')) return 'helping';
    return 'coding';
  }

  private summarizeLogLine(line: string): string {
    const cleaned = line.replace(/\[.*?\]/g, '').trim();
    return cleaned.substring(0, 100) || 'Activity logged';
  }

  private deduplicateExperiences(experiences: SanitizedExperience[]): SanitizedExperience[] {
    const seen = new Set<string>();
    return experiences.filter(exp => {
      const key = `${exp.category}-${exp.activity}-${Math.floor(exp.timestamp.getTime() / 60000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getSummary(experiences: SanitizedExperience[]): string {
    if (experiences.length === 0) return 'Quiet period with no notable activity';
    
    const categories = new Map<ExperienceCategory, number>();
    let totalDuration = 0;
    let successes = 0;
    let failures = 0;

    for (const exp of experiences) {
      categories.set(exp.category, (categories.get(exp.category) || 0) + 1);
      totalDuration += exp.duration_minutes;
      if (exp.outcome === 'success') successes++;
      if (exp.outcome === 'failure') failures++;
    }

    const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
    
    return `${experiences.length} activities over ~${totalDuration} minutes. ` +
           `Mostly ${topCategory[0]} (${topCategory[1]}x). ` +
           `${successes} successes, ${failures} challenges.`;
  }
}
