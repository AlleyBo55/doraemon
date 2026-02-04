/**
 * Doraemon Browser Extension - Content Script
 * 
 * Captures browsing content from whitelisted domains for memory system.
 * Privacy-first: Only captures from explicit whitelist, sanitizes all data.
 */

(() => {
  const CONTENT_CAPTURE_INTERVAL = 30000; // 30 seconds
  const MAX_CONTENT_LENGTH = 500;
  const DEBOUNCE_MS = 5000;
  
  const hostname = window.location.hostname;
  let lastCapturedContent = '';
  let lastCaptureTime = 0;
  let lastTitle = document.title;
  let lastNotificationCount = 0;

  // Original notification interception (keep existing functionality)
  const OriginalNotification = window.Notification;
  
  class InterceptedNotification extends OriginalNotification {
    constructor(title, options = {}) {
      super(title, options);
      sendMessage({
        type: 'NOTIFICATION',
        title: title,
        body: options.body || '',
        icon: options.icon || '',
        url: window.location.href,
      });
    }
  }
  
  Object.defineProperty(InterceptedNotification, 'permission', {
    get: () => OriginalNotification.permission,
  });
  InterceptedNotification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
  window.Notification = InterceptedNotification;

  function sendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch {
      // Extension context invalidated
    }
  }

  function sanitizeText(text) {
    if (!text) return '';
    return text
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?@#$%&*()\-+=:;'"<>\/\\[\]{}|~`]/g, '')
      .trim()
      .substring(0, MAX_CONTENT_LENGTH);
  }

  function isDuplicate(content) {
    if (!content) return true;
    if (content === lastCapturedContent) return true;
    if (Date.now() - lastCaptureTime < DEBOUNCE_MS) return true;
    return false;
  }

  function captureContent(content, contentType) {
    if (isDuplicate(content)) return;
    
    lastCapturedContent = content;
    lastCaptureTime = Date.now();
    
    sendMessage({
      type: 'CONTENT',
      contentType,
      content: sanitizeText(content),
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
    });
  }

  // X/Twitter content capture
  function captureXTwitter() {
    if (!hostname.includes('twitter.com') && !hostname.includes('x.com')) return;
    
    const seenTweets = new Set();
    
    function extractTweets() {
      const tweets = document.querySelectorAll('[data-testid="tweetText"]');
      const captured = [];
      
      tweets.forEach(tweet => {
        const text = tweet.textContent?.trim();
        if (!text || text.length < 20) return;
        if (seenTweets.has(text)) return;
        
        seenTweets.add(text);
        captured.push(text);
      });
      
      if (captured.length > 0) {
        const summary = captured.slice(0, 3).join(' | ');
        captureContent(summary, 'tweet_feed');
      }
    }
    
    // Capture on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(extractTweets, 1000);
    }, { passive: true });
    
    // Initial capture
    setTimeout(extractTweets, 2000);
    
    // Periodic capture
    setInterval(extractTweets, CONTENT_CAPTURE_INTERVAL);
  }

  // Reddit content capture
  function captureReddit() {
    if (!hostname.includes('reddit.com')) return;
    
    const seenPosts = new Set();
    
    function extractPosts() {
      const posts = document.querySelectorAll('h3, [data-testid="post-title"]');
      const captured = [];
      
      posts.forEach(post => {
        const text = post.textContent?.trim();
        if (!text || text.length < 10) return;
        if (seenPosts.has(text)) return;
        
        seenPosts.add(text);
        captured.push(text);
      });
      
      if (captured.length > 0) {
        const summary = captured.slice(0, 5).join(' | ');
        captureContent(summary, 'reddit_posts');
      }
    }
    
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(extractPosts, 1000);
    }, { passive: true });
    
    setTimeout(extractPosts, 2000);
    setInterval(extractPosts, CONTENT_CAPTURE_INTERVAL);
  }

  // YouTube content capture
  function captureYouTube() {
    if (!hostname.includes('youtube.com')) return;
    
    function extractVideoInfo() {
      const title = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata')?.textContent?.trim();
      const channel = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim();
      
      if (title && title.length > 5) {
        const content = channel ? `${title} by ${channel}` : title;
        captureContent(content, 'youtube_video');
      }
    }
    
    // Watch for navigation (YouTube is SPA)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(extractVideoInfo, 2000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(extractVideoInfo, 2000);
  }

  // GitHub content capture
  function captureGitHub() {
    if (!hostname.includes('github.com')) return;
    
    function extractRepoInfo() {
      const repoName = document.querySelector('[itemprop="name"] a, .AppHeader-context-item-label')?.textContent?.trim();
      const description = document.querySelector('[itemprop="about"], .f4.my-3')?.textContent?.trim();
      const readme = document.querySelector('#readme article')?.textContent?.substring(0, 200)?.trim();
      
      const parts = [repoName, description, readme].filter(Boolean);
      if (parts.length > 0) {
        captureContent(parts.join(' - '), 'github_repo');
      }
    }
    
    setTimeout(extractRepoInfo, 2000);
  }

  // Hacker News content capture
  function captureHackerNews() {
    if (!hostname.includes('news.ycombinator.com')) return;
    
    const seenStories = new Set();
    
    function extractStories() {
      const stories = document.querySelectorAll('.titleline > a');
      const captured = [];
      
      stories.forEach(story => {
        const text = story.textContent?.trim();
        if (!text || seenStories.has(text)) return;
        
        seenStories.add(text);
        captured.push(text);
      });
      
      if (captured.length > 0) {
        captureContent(captured.slice(0, 5).join(' | '), 'hackernews');
      }
    }
    
    setTimeout(extractStories, 1000);
  }

  // Generic article capture (for news sites, dev.to, medium, etc.)
  function captureArticle() {
    const articleSites = ['techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com', 'dev.to', 'medium.com'];
    if (!articleSites.some(site => hostname.includes(site))) return;
    
    function extractArticle() {
      const title = document.querySelector('h1')?.textContent?.trim();
      const subtitle = document.querySelector('h2, .subtitle, .dek')?.textContent?.trim();
      
      if (title && title.length > 10) {
        const content = subtitle ? `${title} - ${subtitle}` : title;
        captureContent(content, 'article');
      }
    }
    
    setTimeout(extractArticle, 2000);
  }

  // Manga/Manhwa capture
  function captureManga() {
    if (!hostname.includes('manhwaz') && !hostname.includes('shinigami')) return;
    
    function extractMangaInfo() {
      const title = document.querySelector('h1, .manga-title, .series-title')?.textContent?.trim();
      const chapter = document.querySelector('.chapter-title, .current-chapter')?.textContent?.trim();
      
      if (title) {
        const content = chapter ? `Reading ${title} - ${chapter}` : `Browsing ${title}`;
        captureContent(content, 'manga');
      }
    }
    
    setTimeout(extractMangaInfo, 2000);
  }

  // Title change detection (existing functionality)
  function observeTitleChanges() {
    const pattern = getTitlePattern();
    if (!pattern) return;
    
    const checkTitle = () => {
      const newTitle = document.title;
      if (newTitle === lastTitle) return;
      handleTitleChange(lastTitle, newTitle);
      lastTitle = newTitle;
    };
    
    const observer = new MutationObserver(checkTitle);
    const titleEl = document.querySelector('title');
    if (titleEl) {
      observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
    }
    setInterval(checkTitle, 2000);
  }

  function getTitlePattern() {
    if (hostname.includes('twitter') || hostname.includes('x.com')) return /^\((\d+)\)/;
    if (hostname.includes('outlook')) return /^\((\d+)\)/;
    if (hostname.includes('teams.microsoft')) return /^\((\d+)\)/;
    if (hostname.includes('web.whatsapp')) return /^\((\d+)\)/;
    if (hostname.includes('slack')) return /^\((\d+)\)/;
    if (hostname.includes('discord')) return /^\((\d+)\)/;
    return null;
  }

  function handleTitleChange(oldTitle, newTitle) {
    const pattern = getTitlePattern();
    if (!pattern) return;
    
    const oldMatch = oldTitle.match(pattern);
    const newMatch = newTitle.match(pattern);
    
    const oldCount = oldMatch ? parseInt(oldMatch[1], 10) : 0;
    const newCount = newMatch ? parseInt(newMatch[1], 10) : 0;
    
    if (newCount > oldCount) {
      const diff = newCount - oldCount;
      sendMessage({
        type: 'NOTIFICATION',
        title: getAppName(),
        body: `${diff} new notification${diff > 1 ? 's' : ''}`,
        url: window.location.href,
      });
    }
  }

  function getAppName() {
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'X/Twitter';
    if (hostname.includes('outlook')) return 'Outlook';
    if (hostname.includes('teams')) return 'Teams';
    if (hostname.includes('github')) return 'GitHub';
    if (hostname.includes('whatsapp')) return 'WhatsApp';
    if (hostname.includes('slack')) return 'Slack';
    if (hostname.includes('discord')) return 'Discord';
    return 'Web';
  }

  // Listen for heartbeat checks
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEARTBEAT_CHECK') {
      sendResponse({ ok: true });
    }
    return true;
  });

  // Initialize all capture functions
  function init() {
    observeTitleChanges();
    captureXTwitter();
    captureReddit();
    captureYouTube();
    captureGitHub();
    captureHackerNews();
    captureArticle();
    captureManga();
    
    console.log('[Doraemon] Content capture initialized for', hostname);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
