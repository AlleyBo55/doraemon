import type { FunctionalComponent } from 'preact';

type NotificationSource = 'twitter' | 'whatsapp' | 'outlook' | 'teams' | 'github' | 'slack' | 'discord' | 'messages' | 'mail' | 'telegram' | 'chrome' | 'safari' | 'unknown';

type NotificationBubbleProps = {
  source: NotificationSource;
  title: string;
  body?: string;
  position?: 'top' | 'bottom';
  className?: string;
};

const APP_ICONS: Record<NotificationSource, { emoji: string; gradient: string; glow: string }> = {
  twitter: { emoji: '𝕏', gradient: 'linear-gradient(135deg, #000 0%, #1a1a1a 100%)', glow: 'rgba(0,0,0,0.3)' },
  whatsapp: { emoji: '💬', gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', glow: 'rgba(37,211,102,0.4)' },
  outlook: { emoji: '📧', gradient: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)', glow: 'rgba(0,120,212,0.4)' },
  teams: { emoji: '👥', gradient: 'linear-gradient(135deg, #6264A7 0%, #464775 100%)', glow: 'rgba(98,100,167,0.4)' },
  github: { emoji: '🐙', gradient: 'linear-gradient(135deg, #24292e 0%, #0d1117 100%)', glow: 'rgba(36,41,46,0.4)' },
  slack: { emoji: '💼', gradient: 'linear-gradient(135deg, #4A154B 0%, #611f69 100%)', glow: 'rgba(74,21,75,0.4)' },
  discord: { emoji: '🎮', gradient: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)', glow: 'rgba(88,101,242,0.4)' },
  messages: { emoji: '💬', gradient: 'linear-gradient(135deg, #34C759 0%, #30B350 100%)', glow: 'rgba(52,199,89,0.4)' },
  mail: { emoji: '✉️', gradient: 'linear-gradient(135deg, #007AFF 0%, #0056CC 100%)', glow: 'rgba(0,122,255,0.4)' },
  telegram: { emoji: '✈️', gradient: 'linear-gradient(135deg, #0088CC 0%, #006699 100%)', glow: 'rgba(0,136,204,0.4)' },
  chrome: { emoji: '🌐', gradient: 'linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 75%, #EA4335 100%)', glow: 'rgba(66,133,244,0.4)' },
  safari: { emoji: '🧭', gradient: 'linear-gradient(135deg, #006CFF 0%, #00D4FF 100%)', glow: 'rgba(0,108,255,0.4)' },
  unknown: { emoji: '🔔', gradient: 'linear-gradient(135deg, #8E8E93 0%, #636366 100%)', glow: 'rgba(142,142,147,0.4)' },
};

const getSourceFromTitle = (title: string): NotificationSource => {
  const lower = title.toLowerCase();
  if (lower.includes('twitter') || lower.includes('x/twitter') || title.includes('𝕏')) return 'twitter';
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
  const { emoji, gradient, glow } = APP_ICONS[source] || APP_ICONS.unknown;
  const positionClass = position === 'top' ? 'bottom-full mb-3' : 'top-full mt-3';
  
  const cleanTitle = title.replace(/^[🐦📧💬🐙💼🎮✈️🌐🧭🔔✉️]\s*/, '').replace(/^(X\/Twitter|WhatsApp|Outlook|Teams|GitHub|Slack|Discord|Messages|Mail|Telegram|Chrome|Safari)\s*/i, '');

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
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.8) inset,
            0 4px 24px rgba(0,0,0,0.12),
            0 8px 32px rgba(0,0,0,0.08),
            0 0 40px ${glow}
          `,
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
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
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
            fontSize: '22px',
            boxShadow: `0 4px 12px ${glow}, 0 2px 4px rgba(0,0,0,0.1)`,
            animation: 'iconPulse 2s ease-in-out infinite',
          }}
        >
          {emoji}
        </div>
        
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
            boxShadow: position === 'top' 
              ? '2px 2px 4px rgba(0,0,0,0.06)' 
              : '-2px -2px 4px rgba(0,0,0,0.06)',
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
