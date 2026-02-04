/**
 * URL Reader
 * 
 * Reads content from URLs (manga sites, news, articles) and feeds to Doraemon.
 * Controlled by URL_READER_ENABLED env variable.
 * 
 * Supported sites:
 * - manhwaz.com (manga)
 * - shinigami09.com (manga)
 * - Other article sites (generic parser)
 */

import { net } from 'electron';
import { feedManga, feedArticle, feedVideo } from './media-feed.js';
import { experienceBridge } from './bridge.js';

export interface URLReadResult {
  success: boolean;
  type: 'manga' | 'article' | 'video' | 'unknown';
  title?: string;
  content?: string;
  chapter?: number;
  error?: string;
}

const MANGA_SITES: Record<string, MangaSiteConfig> = {
  'manhwaz.com': {
    titleSelector: 'h1.entry-title, .chapter-title, h1',
    chapterPattern: /chapter[- ]?(\d+)/i,
    contentSelector: '.reading-content img, .chapter-content img, #readerarea img',
    type: 'image-based',
  },
  'shinigami09.com': {
    titleSelector: 'h1.entry-title, .chapter-title, h1',
    chapterPattern: /chapter[- ]?(\d+)/i,
    contentSelector: '.reading-content img, .chapter-content img',
    type: 'image-based',
  },
};

interface MangaSiteConfig {
  titleSelector: string;
  chapterPattern: RegExp;
  contentSelector: string;
  type: 'image-based' | 'text-based';
}

export function isURLReaderEnabled(): boolean {
  return process.env['URL_READER_ENABLED'] === '1';
}

export async function readURL(url: string): Promise<URLReadResult> {
  if (!isURLReaderEnabled()) {
    return { success: false, type: 'unknown', error: 'URL_READER_ENABLED is not set to 1' };
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    // Check if it's a known manga site
    const mangaConfig = Object.entries(MANGA_SITES).find(([site]) => domain.includes(site));
    
    if (mangaConfig) {
      return await readMangaURL(url, mangaConfig[0], mangaConfig[1]);
    }

    // Check for video sites
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      return await readVideoURL(url);
    }

    // Generic article reading
    return await readArticleURL(url);
  } catch (e) {
    return { success: false, type: 'unknown', error: String(e) };
  }
}

async function fetchHTML(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    let data = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        data += chunk.toString();
      });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    request.end();
  });
}

async function readMangaURL(url: string, _domain: string, config: MangaSiteConfig): Promise<URLReadResult> {
  try {
    const html = await fetchHTML(url);
    
    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown Manga';
    
    // Extract chapter number from URL or title
    const chapterMatch = url.match(config.chapterPattern) || title.match(config.chapterPattern);
    const chapter = chapterMatch ? parseInt(chapterMatch[1]) : 0;
    
    // Extract manga name (remove chapter info)
    const mangaName = title.replace(/chapter[- ]?\d+/i, '').replace(/[-–]\s*$/, '').trim();
    
    // Count images (we don't actually read them, just note how many pages)
    const imgMatches = html.match(/<img[^>]+src="[^"]+"/gi) || [];
    const pageCount = imgMatches.length;
    
    // Generate a summary based on what we can extract
    const summary = `Read ${mangaName} Chapter ${chapter} (${pageCount} pages)`;
    
    // Feed to Doraemon
    const result = await feedManga(mangaName || 'Unknown', chapter, summary, [`${pageCount} pages read`]);
    
    // Send thought to UI
    experienceBridge.sendCodingThought(`Reading ${mangaName} Ch.${chapter}~ 📖`, 'manga');

    return {
      success: true,
      type: 'manga',
      title: mangaName,
      chapter,
      content: summary,
    };
  } catch (e) {
    return { success: false, type: 'manga', error: String(e) };
  }
}

async function readArticleURL(url: string): Promise<URLReadResult> {
  try {
    const html = await fetchHTML(url);
    
    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                       html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Article';
    
    // Extract meta description or first paragraph
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                      html.match(/<p[^>]*>([^<]{50,200})/i);
    const description = descMatch ? descMatch[1].trim() : 'No description available';
    
    // Feed to Doraemon
    const result = await feedArticle(title, description, url);
    
    experienceBridge.sendCodingThought(`Reading article: ${title.substring(0, 30)}...`, 'article');

    return {
      success: true,
      type: 'article',
      title,
      content: description,
    };
  } catch (e) {
    return { success: false, type: 'article', error: String(e) };
  }
}

async function readVideoURL(url: string): Promise<URLReadResult> {
  try {
    const html = await fetchHTML(url);
    
    // Extract video title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Video';
    
    // Extract description
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
    const description = descMatch ? descMatch[1].trim() : 'Video content';
    
    // Feed to Doraemon
    await feedVideo(title, description, url);
    
    experienceBridge.sendCodingThought(`Watching: ${title.substring(0, 30)}...`, 'video');

    return {
      success: true,
      type: 'video',
      title,
      content: description,
    };
  } catch (e) {
    return { success: false, type: 'video', error: String(e) };
  }
}

export async function readMangaChapter(
  site: string,
  mangaSlug: string,
  chapter: number
): Promise<URLReadResult> {
  const siteConfig = MANGA_SITES[site];
  if (!siteConfig) {
    return { success: false, type: 'manga', error: `Unknown manga site: ${site}` };
  }

  const url = `https://${site}/${mangaSlug}/chapter-${chapter}/`;
  return readURL(url);
}
