(() => {
  const OriginalNotification = window.Notification;
  
  class InterceptedNotification extends OriginalNotification {
    constructor(title, options = {}) {
      super(title, options);
      
      chrome.runtime.sendMessage({
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
  
  function observeTitleChanges() {
    const hostname = window.location.hostname;
    let lastTitle = document.title;
    
    const patterns = {
      'twitter.com': /^\((\d+)\)/,
      'x.com': /^\((\d+)\)/,
      'outlook.office.com': /^\((\d+)\)/,
      'outlook.live.com': /^\((\d+)\)/,
      'teams.microsoft.com': /^\((\d+)\)/,
      'github.com': null,
    };
    
    const observer = new MutationObserver(() => {
      const newTitle = document.title;
      if (newTitle === lastTitle) return;
      
      const pattern = patterns[hostname];
      if (pattern) {
        const oldMatch = lastTitle.match(pattern);
        const newMatch = newTitle.match(pattern);
        
        const oldCount = oldMatch ? parseInt(oldMatch[1], 10) : 0;
        const newCount = newMatch ? parseInt(newMatch[1], 10) : 0;
        
        if (newCount > oldCount) {
          const diff = newCount - oldCount;
          chrome.runtime.sendMessage({
            type: 'NOTIFICATION',
            title: getAppName(hostname),
            body: `${diff} new notification${diff > 1 ? 's' : ''}`,
            url: window.location.href,
          });
        }
      }
      
      lastTitle = newTitle;
    });
    
    observer.observe(document.querySelector('title') || document.head, {
      subtree: true,
      characterData: true,
      childList: true,
    });
  }
  
  function getAppName(hostname) {
    if (hostname.includes('twitter') || hostname.includes('x.com')) return '🐦 Twitter';
    if (hostname.includes('outlook')) return '📧 Outlook';
    if (hostname.includes('teams')) return '💬 Teams';
    if (hostname.includes('github')) return '🐙 GitHub';
    return 'Web';
  }
  
  function observeGitHubNotifications() {
    if (!window.location.hostname.includes('github.com')) return;
    
    const checkNotificationBadge = () => {
      const badge = document.querySelector('.notification-indicator .mail-status');
      if (badge && !badge.classList.contains('unread')) {
        const unreadDot = document.querySelector('.notification-indicator .unread');
        if (unreadDot) {
          chrome.runtime.sendMessage({
            type: 'NOTIFICATION',
            title: '🐙 GitHub',
            body: 'You have new notifications',
            url: 'https://github.com/notifications',
          });
        }
      }
    };
    
    const observer = new MutationObserver(checkNotificationBadge);
    const indicator = document.querySelector('.notification-indicator');
    if (indicator) {
      observer.observe(indicator, { subtree: true, attributes: true, childList: true });
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observeTitleChanges();
      observeGitHubNotifications();
    });
  } else {
    observeTitleChanges();
    observeGitHubNotifications();
  }
  
  console.log('[Doraemon Extension] Content script loaded for', window.location.hostname);
})();
