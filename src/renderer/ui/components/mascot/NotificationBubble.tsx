import type { FunctionalComponent } from 'preact';

type NotificationSource = 'twitter' | 'whatsapp' | 'outlook' | 'teams' | 'github' | 'slack' | 'discord' | 'messages' | 'mail' | 'telegram' | 'chrome' | 'safari' | 'kiro' | 'vscode' | 'cursor' | 'unknown';

type NotificationBubbleProps = {
  source: NotificationSource;
  title: string;
  body?: string;
  position?: 'top' | 'bottom';
  className?: string;
};

type AppIconConfig = { icon: string; gradient: string; glow: string };

const APP_ICONS: Record<NotificationSource, AppIconConfig> = {
  twitter: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    gradient: 'linear-gradient(135deg, #000 0%, #1a1a1a 100%)', glow: 'rgba(0,0,0,0.3)' 
  },
  whatsapp: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', glow: 'rgba(37,211,102,0.4)' 
  },
  outlook: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z"/></svg>`,
    gradient: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)', glow: 'rgba(0,120,212,0.4)' 
  },
  teams: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M20.625 8.073h-5.27v7.674c0 1.263-.464 2.35-1.39 3.262-.927.912-2.047 1.368-3.36 1.368-.263 0-.513-.018-.75-.054v1.604c0 .553.197 1.026.592 1.418.395.392.87.588 1.428.588h6.75c.558 0 1.033-.196 1.428-.588.395-.392.592-.865.592-1.418v-11.78c0-.553-.197-1.026-.592-1.418-.395-.392-.87-.588-1.428-.588v-.068zM16.5 6.75c1.243 0 2.25-1.007 2.25-2.25S17.743 2.25 16.5 2.25 14.25 3.257 14.25 4.5s1.007 2.25 2.25 2.25zM10.5 7.5c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm3.75 1.5H6.75c-.553 0-1.026.197-1.418.592-.392.395-.588.87-.588 1.428v5.73c0 1.657.62 3.08 1.86 4.27 1.24 1.19 2.73 1.785 4.47 1.785 1.74 0 3.23-.595 4.47-1.785 1.24-1.19 1.86-2.613 1.86-4.27V11.02c0-.558-.196-1.033-.588-1.428-.392-.395-.865-.592-1.418-.592h-.148z"/></svg>`,
    gradient: 'linear-gradient(135deg, #6264A7 0%, #464775 100%)', glow: 'rgba(98,100,167,0.4)' 
  },
  github: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
    gradient: 'linear-gradient(135deg, #24292e 0%, #0d1117 100%)', glow: 'rgba(36,41,46,0.4)' 
  },
  slack: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
    gradient: 'linear-gradient(135deg, #4A154B 0%, #611f69 100%)', glow: 'rgba(74,21,75,0.4)' 
  },
  discord: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>`,
    gradient: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)', glow: 'rgba(88,101,242,0.4)' 
  },
  messages: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M11.99 0C5.926 0 .96 4.297.96 9.594c0 2.916 1.523 5.532 3.91 7.312-.2.96-.534 2.362-.96 3.484-.106.28.196.548.464.412 1.726-.876 3.097-1.69 4.076-2.282.93.214 1.9.33 2.9.33 6.064 0 10.99-4.297 10.99-9.594C23.34 4.297 18.054 0 11.99 0z"/></svg>`,
    gradient: 'linear-gradient(135deg, #34C759 0%, #30B350 100%)', glow: 'rgba(52,199,89,0.4)' 
  },
  mail: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9.06 8.683L5.648 6.238 4.353 7.762l7.72 6.555 7.581-6.56-1.308-1.513-6.285 5.439z"/></svg>`,
    gradient: 'linear-gradient(135deg, #007AFF 0%, #0056CC 100%)', glow: 'rgba(0,122,255,0.4)' 
  },
  telegram: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    gradient: 'linear-gradient(135deg, #0088CC 0%, #006699 100%)', glow: 'rgba(0,136,204,0.4)' 
  },
  chrome: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z"/></svg>`,
    gradient: 'linear-gradient(135deg, #4285F4 0%, #1a73e8 100%)', glow: 'rgba(66,133,244,0.4)' 
  },
  safari: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 24C5.373 24 0 18.627 0 12S5.373 0 12 0s12 5.373 12 12-5.373 12-12 12zm0-2c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-1.276-4.553l1.844-5.625 5.625-1.844-1.844 5.625-5.625 1.844zM12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`,
    gradient: 'linear-gradient(135deg, #006CFF 0%, #00D4FF 100%)', glow: 'rgba(0,108,255,0.4)' 
  },
  kiro: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    gradient: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)', glow: 'rgba(255,107,53,0.4)' 
  },
  vscode: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>`,
    gradient: 'linear-gradient(135deg, #007ACC 0%, #0065A9 100%)', glow: 'rgba(0,122,204,0.4)' 
  },
  cursor: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z"/></svg>`,
    gradient: 'linear-gradient(135deg, #000 0%, #333 100%)', glow: 'rgba(0,0,0,0.3)' 
  },
  unknown: { 
    icon: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>`,
    gradient: 'linear-gradient(135deg, #8E8E93 0%, #636366 100%)', glow: 'rgba(142,142,147,0.4)' 
  },
};

const getSourceFromTitle = (title: string): NotificationSource => {
  const lower = title.toLowerCase();
  if (lower.includes('twitter') || lower.includes('x/twitter') || title.includes('X')) return 'twitter';
  if (lower.includes('whatsapp')) return 'whatsapp';
  if (lower.includes('outlook')) return 'outlook';
  if (lower.includes('teams')) return 'teams';
  if (lower.includes('github')) return 'github';
  if (lower.includes('slack')) return 'slack';
  if (lower.includes('discord')) return 'discord';
  if (lower.includes('messages')) return 'messages';
  if (lower.includes('mail')) return 'mail';
  if (lower.includes('telegram')) return 'telegram';
  if (lower.includes('chrome')) return 'chrome';
  if (lower.includes('safari')) return 'safari';
  if (lower.includes('kiro')) return 'kiro';
  if (lower.includes('vscode') || lower.includes('visual studio code')) return 'vscode';
  if (lower.includes('cursor')) return 'cursor';
  return 'unknown';
};

export const NotificationBubble: FunctionalComponent<NotificationBubbleProps> = ({
  source: sourceProp,
  title,
  body,
  position = 'top',
  className = '',
}) => {
  const source = sourceProp || getSourceFromTitle(title);
  const { icon, gradient, glow } = APP_ICONS[source] || APP_ICONS.unknown;
  const positionClass = position === 'top' ? 'bottom-full mb-3' : 'top-full mt-3';
  
  const cleanTitle = title
    .replace(/^(X\/Twitter|WhatsApp|Outlook|Teams|GitHub|Slack|Discord|Messages|Mail|Telegram|Chrome|Safari)\s*/i, '');

  return (
    <div
      class={`absolute left-1/2 -translate-x-1/2 ${positionClass} ${className}`}
      style={{ zIndex: 1000, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          padding: '16px 20px',
          borderRadius: '20px',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.8) inset, 0 4px 24px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.08), 0 0 40px ${glow}`,
          minWidth: '260px',
          maxWidth: '380px',
          animation: 'notificationSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <style>{`
          @keyframes notificationSlideIn {
            0% { opacity: 0; transform: translateY(12px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes iconPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
        
        <div
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${glow}, 0 2px 4px rgba(0,0,0,0.1)`,
            animation: 'iconPulse 2s ease-in-out infinite',
          }}
          dangerouslySetInnerHTML={{ __html: icon.replace('viewBox', 'width="24" height="24" viewBox') }}
        />

        <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#8E8E93',
              marginBottom: '4px',
            }}
          >
            Notification
          </div>
          
          <div
            style={{
              fontSize: '15px',
              fontWeight: '600',
              color: '#1D1D1F',
              lineHeight: '1.35',
              marginBottom: body ? '6px' : '0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {cleanTitle || title}
          </div>
          
          {body && (
            <div
              style={{
                fontSize: '13px',
                color: '#636366',
                lineHeight: '1.45',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {body}
            </div>
          )}
        </div>
        
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            borderRadius: '20px 20px 0 0',
          }}
        />
        
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '14px',
            height: '14px',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: position === 'top' ? '2px 2px 4px rgba(0,0,0,0.06)' : '-2px -2px 4px rgba(0,0,0,0.06)',
            top: position === 'top' ? '100%' : 'auto',
            bottom: position === 'top' ? 'auto' : '100%',
            marginTop: position === 'top' ? '-7px' : '0',
            marginBottom: position === 'top' ? '0' : '-7px',
          }}
        />
      </div>
    </div>
  );
};