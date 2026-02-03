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
  
  const hostname = window.location.hostname;
  let lastTitle = document.title;
  let lastNotificationCount = 0;
  
  // Listen for heartbeat checks from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEARTBEAT_CHECK') {
      checkCurrentState();
      sendResponse({ ok: true });
    }
    return true;
  });
  
  function checkCurrentState() {
    // Re-check title for notification count
    const title = document.title;
    if (title !== lastTitle) {
      handleTitleChange(lastTitle, title);
      lastTitle = title;
    }
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
      sendNotification(getAppName(), `${diff} new notification${diff > 1 ? 's' : ''}`);
    }
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
  
  function getAppName() {
    if (hostname.includes('twitter') || hostname.includes('x.com')) return '🐦 X/Twitter';
    if (hostname.includes('outlook')) return '📧 Outlook';
    if (hostname.includes('teams')) return '💬 Teams';
    if (hostname.includes('github')) return '🐙 GitHub';
    if (hostname.includes('whatsapp')) return '💬 WhatsApp';
    if (hostname.includes('slack')) return '💼 Slack';
    if (hostname.includes('discord')) return '🎮 Discord';
    return '🔔 Web';
  }
  
  function sendNotification(title, body) {
    console.log('[Doraemon Extension] Sending notification:', title, body);
    try {
      chrome.runtime.sendMessage({
        type: 'NOTIFICATION',
        title: title,
        body: body,
        url: window.location.href,
      });
    } catch (err) {
      console.log('[Doraemon Extension] Extension reloaded, please refresh the page');
    }
  }

  function observeTitleChanges() {
    const pattern = getTitlePattern();
    
    if (!pattern) {
      console.log('[Doraemon Extension] No pattern for hostname:', hostname);
      return;
    }
    
    console.log('[Doraemon Extension] Using pattern for:', hostname);
    
    const checkTitle = () => {
      const newTitle = document.title;
      if (newTitle === lastTitle) return;
      
      console.log('[Doraemon Extension] Title changed:', lastTitle, '->', newTitle);
      handleTitleChange(lastTitle, newTitle);
      lastTitle = newTitle;
    };
    
    const observer = new MutationObserver(checkTitle);
    const titleEl = document.querySelector('title');
    if (titleEl) {
      observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
      console.log('[Doraemon Extension] Watching title element');
    } else {
      console.log('[Doraemon Extension] No title element found!');
    }
    
    // Also check periodically in case MutationObserver misses it
    setInterval(checkTitle, 2000);
  }

  function observeXTwitter() {
    if (!hostname.includes('twitter.com') && !hostname.includes('x.com')) return;
    
    // Watch for notification badge on the bell icon
    const checkNotificationBadge = () => {
      // X uses aria-label with count on notification link
      const notifLink = document.querySelector('a[href="/notifications"]');
      if (notifLink) {
        const badge = notifLink.querySelector('[aria-label]');
        if (badge) {
          const label = badge.getAttribute('aria-label') || '';
          const match = label.match(/(\d+)\s*(unread|new)/i);
          if (match) {
            const count = parseInt(match[1], 10);
            if (count > lastNotificationCount) {
              sendNotification('🐦 X/Twitter', `${count - lastNotificationCount} new notification${count - lastNotificationCount > 1 ? 's' : ''}`);
              lastNotificationCount = count;
            }
          }
        }
      }
    };
    
    // Watch for toast notifications (the popup that appears)
    const observeToasts = () => {
      const toastObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // X shows toasts in a specific container
              const toast = node.querySelector?.('[data-testid="toast"]') || 
                           (node.getAttribute?.('data-testid') === 'toast' ? node : null);
              if (toast) {
                const text = toast.textContent || '';
                if (text && !text.includes('Copied') && !text.includes('saved')) {
                  sendNotification('🐦 X/Twitter', text.slice(0, 100));
                }
              }
            }
          }
        }
      });
      
      toastObserver.observe(document.body, { childList: true, subtree: true });
    };
    
    // Check badge periodically
    setInterval(checkNotificationBadge, 3000);
    observeToasts();
  }

  function observeGitHub() {
    if (!hostname.includes('github.com')) return;
    
    let lastUnread = false;
    
    const checkNotifications = () => {
      const indicator = document.querySelector('.notification-indicator');
      if (!indicator) return;
      
      const hasUnread = indicator.querySelector('.unread, .mail-status.unread') !== null;
      
      if (hasUnread && !lastUnread) {
        sendNotification('🐙 GitHub', 'You have new notifications');
      }
      
      lastUnread = hasUnread;
    };
    
    const observer = new MutationObserver(checkNotifications);
    
    // Wait for indicator to appear
    const waitForIndicator = setInterval(() => {
      const indicator = document.querySelector('.notification-indicator');
      if (indicator) {
        clearInterval(waitForIndicator);
        observer.observe(indicator, { subtree: true, attributes: true, childList: true });
        checkNotifications();
      }
    }, 1000);
  }

  function observeOutlook() {
    if (!hostname.includes('outlook')) return;
    
    // Outlook shows unread count in various places
    const checkUnread = () => {
      const unreadBadge = document.querySelector('[aria-label*="unread"]');
      if (unreadBadge) {
        const label = unreadBadge.getAttribute('aria-label') || '';
        const match = label.match(/(\d+)\s*unread/i);
        if (match) {
          const count = parseInt(match[1], 10);
          if (count > lastNotificationCount) {
            sendNotification('📧 Outlook', `${count - lastNotificationCount} new email${count - lastNotificationCount > 1 ? 's' : ''}`);
            lastNotificationCount = count;
          }
        }
      }
    };
    
    setInterval(checkUnread, 5000);
  }

  function observeTeams() {
    if (!hostname.includes('teams.microsoft.com')) return;
    
    // Teams shows activity badge
    const checkActivity = () => {
      const activityBadge = document.querySelector('[data-tid="activity-badge"]');
      if (activityBadge) {
        const count = parseInt(activityBadge.textContent || '0', 10);
        if (count > lastNotificationCount) {
          sendNotification('💬 Teams', `${count - lastNotificationCount} new message${count - lastNotificationCount > 1 ? 's' : ''}`);
          lastNotificationCount = count;
        }
      }
    };
    
    setInterval(checkActivity, 3000);
  }

  function observeWhatsApp() {
    if (!hostname.includes('web.whatsapp.com')) return;
    
    let lastUnreadCount = 0;
    
    const checkUnread = () => {
      // WhatsApp shows unread badges on chat list items
      const unreadBadges = document.querySelectorAll('[data-testid="icon-unread-count"]');
      let totalUnread = 0;
      
      unreadBadges.forEach(badge => {
        const count = parseInt(badge.textContent || '0', 10);
        if (!isNaN(count)) totalUnread += count;
      });
      
      if (totalUnread > lastUnreadCount) {
        const diff = totalUnread - lastUnreadCount;
        sendNotification('💬 WhatsApp', `${diff} new message${diff > 1 ? 's' : ''}`);
      }
      
      lastUnreadCount = totalUnread;
    };
    
    // WhatsApp Web uses dynamic loading, so poll periodically
    setInterval(checkUnread, 3000);
  }

  function observeSlack() {
    if (!hostname.includes('slack.com')) return;
    
    let lastUnread = 0;
    
    const checkUnread = () => {
      // Slack shows unread indicator in sidebar
      const unreadBadges = document.querySelectorAll('.p-channel_sidebar__badge');
      let total = 0;
      
      unreadBadges.forEach(badge => {
        const count = parseInt(badge.textContent || '0', 10);
        if (!isNaN(count)) total += count;
      });
      
      if (total > lastUnread) {
        sendNotification('💼 Slack', `${total - lastUnread} new message${total - lastUnread > 1 ? 's' : ''}`);
      }
      
      lastUnread = total;
    };
    
    setInterval(checkUnread, 3000);
  }

  function observeDiscord() {
    if (!hostname.includes('discord.com')) return;
    
    let lastMentions = 0;
    
    const checkMentions = () => {
      // Discord shows mention badges
      const mentionBadges = document.querySelectorAll('[class*="numberBadge"]');
      let total = 0;
      
      mentionBadges.forEach(badge => {
        const count = parseInt(badge.textContent || '0', 10);
        if (!isNaN(count)) total += count;
      });
      
      if (total > lastMentions) {
        sendNotification('🎮 Discord', `${total - lastMentions} new mention${total - lastMentions > 1 ? 's' : ''}`);
      }
      
      lastMentions = total;
    };
    
    setInterval(checkMentions, 3000);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    observeTitleChanges();
    observeXTwitter();
    observeGitHub();
    observeOutlook();
    observeTeams();
    observeWhatsApp();
    observeSlack();
    observeDiscord();
    console.log('[Doraemon Extension] Content script loaded for', hostname);
  }
})();
