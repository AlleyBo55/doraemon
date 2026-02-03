import { render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { MascotLayout } from './ui/layouts';
import { ChatBubble, NotificationBubble, EmotionIndicator, ChatInput } from './ui/components/mascot';
import { useEmotion, useIdleDetection, useOpenClaw, useRandomThoughts } from './hooks';
import { ShimejiEngine, getAnimationForState } from './core/engine';
import type { Position } from './core/engine';
import { getAnimation } from './core/constants/sprites';
import './styles/globals.css';

const SPRITE_BASE = '/dora-sprites';

declare global {
  interface Window {
    electronAPI?: {
      onResetPosition: (callback: (pos: { x: number; y: number }) => void) => void;
      setMouseEvents: (enabled: boolean) => void;
      focusWindow: () => void;
      onNotification: (callback: (data: { app: string; title: string; message: string }) => void) => void;
      onEditorActivity: (callback: (data: { editor: string; action: string; file?: string; language?: string; fileType?: string; thought: string; emotion: string; animation: string }) => void) => void;
      onBreakReminder: (callback: (data: { minutes: number; message: string }) => void) => void;
      onCodingStreak: (callback: (data: { minutes: number; message: string }) => void) => void;
      onDailySummary: (callback: (data: { message: string; duration: number; priority: boolean }) => void) => void;
      getCodingStats: () => Promise<{ sessionStart: number; totalCodingTime: number; filesEdited: number; languagesUsed: string[]; commitCount: number; currentStreak: number; longestStreak: number }>;
      getDailySummary: () => Promise<string>;
      onToggleChat: (callback: () => void) => void;
      onClearHistory: (callback: () => void) => void;
      onTriggerEmotion: (callback: (emotion: string) => void) => void;
      onStopCodingMode: (callback: () => void) => void;
      onWebNotification: (callback: (data: { source: string; title: string; body: string; url?: string }) => void) => void;
    };
  }
}

type NotificationData = {
  source: string;
  title: string;
  body?: string;
} | null;

const App = () => {
  const [position, setPosition] = useState<Position>({ x: window.innerWidth / 2 - 64, y: window.innerHeight - 200 });
  const [currentFrame, setCurrentFrame] = useState('shime1.png');
  const [flip, setFlip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [externalThought, setExternalThought] = useState<string | null>(null);
  const [notificationData, setNotificationData] = useState<NotificationData>(null);
  const [isCodingMode, setIsCodingMode] = useState(false);
  const [priorityMessage, setPriorityMessage] = useState<string | null>(null);
  
  const { current: emotion } = useEmotion();
  const {
    isConnected,
    isThinking,
    currentThought,
    sendMessage,
    triggerEmotion,
    clearHistory,
  } = useOpenClaw();

  // Pass externalThought to pause random thoughts, but let coding mode handle its own thoughts
  const { thought: randomThought } = useRandomThoughts(emotion, isConnected, externalThought !== null || notificationData !== null, isCodingMode);

  const engineRef = useRef<ShimejiEngine | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameIndexRef = useRef<number>(0);
  const frameTimerRef = useRef<number>(0);
  const currentAnimRef = useRef<string>('idle');
  const externalThoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerEmotionRef = useRef(triggerEmotion);
  const codingAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codingModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priorityMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Keep refs updated
  useEffect(() => { triggerEmotionRef.current = triggerEmotion; }, [triggerEmotion]);

  useIdleDetection();

  // Helper to trigger coding animation temporarily - this LOCKS the animation
  const triggerCodingAnimation = useCallback((animation: string, duration = 8000) => {
    if (codingAnimTimerRef.current) clearTimeout(codingAnimTimerRef.current);
    
    console.log('[App] Triggering coding animation:', animation, 'for', duration, 'ms');
    
    // Lock the animation by setting it directly and preventing engine override
    currentAnimRef.current = animation;
    frameIndexRef.current = 0;
    frameTimerRef.current = 0;
    
    // Tell the engine to pause behavior changes AND force stationary state
    if (engineRef.current) {
      (engineRef.current as any)._codingLock = true;
      (engineRef.current as any)._forcedCodingState = animation;
    }
    
    codingAnimTimerRef.current = setTimeout(() => {
      console.log('[App] Coding animation ended, unlocking');
      // Unlock and return to normal behavior
      if (engineRef.current) {
        (engineRef.current as any)._codingLock = false;
        (engineRef.current as any)._forcedCodingState = null;
      }
      currentAnimRef.current = 'idle';
      frameIndexRef.current = 0;
    }, duration);
  }, []);

  // Helper to show external thoughts
  const showExternalThought = useCallback((thought: string, duration = 5000) => {
    if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
    setExternalThought(thought);
    externalThoughtTimerRef.current = setTimeout(() => setExternalThought(null), duration);
  }, []);

  // Listen for web notifications from browser extension - separate effect, runs once
  useEffect(() => {
    console.log('[App] Registering web notification listener');
    window.electronAPI?.onWebNotification?.((data) => {
      console.log('[App] Web notification received:', data);
      
      // Clear any existing timers
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
      
      // Set notification data for the fancy bubble
      setNotificationData({
        source: data.source,
        title: data.title,
        body: data.body,
      });
      setExternalThought(null); // Clear any text-based external thought
      
      // Auto-dismiss after 15 seconds
      notificationTimerRef.current = setTimeout(() => {
        setNotificationData(null);
      }, 15000);
    });
    
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    };
  }, []);

  // Listen for other notifications and editor activity
  useEffect(() => {
    window.electronAPI?.onNotification?.((data) => {
      // Native macOS notifications - use the fancy bubble
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
      
      // Detect source from app name
      const appLower = data.app.toLowerCase();
      let source = 'unknown';
      if (appLower.includes('whatsapp')) source = 'whatsapp';
      else if (appLower.includes('messages')) source = 'messages';
      else if (appLower.includes('mail')) source = 'mail';
      else if (appLower.includes('teams')) source = 'teams';
      else if (appLower.includes('outlook')) source = 'outlook';
      else if (appLower.includes('slack')) source = 'slack';
      else if (appLower.includes('discord')) source = 'discord';
      else if (appLower.includes('telegram')) source = 'telegram';
      
      setNotificationData({
        source,
        title: data.app,
        body: data.message || data.title,
      });
      setExternalThought(null);
      
      notificationTimerRef.current = setTimeout(() => {
        setNotificationData(null);
      }, 15000);
    });

    window.electronAPI?.onEditorActivity?.((data) => {
      console.log('[App] Editor activity received:', data);
      
      // Enter coding mode - suppress random thoughts for 15 seconds after activity
      setIsCodingMode(true);
      if (codingModeTimerRef.current) clearTimeout(codingModeTimerRef.current);
      codingModeTimerRef.current = setTimeout(() => {
        setIsCodingMode(false);
      }, 15000);
      
      if (data.thought) {
        // Show thought for same duration as animation (8s) to keep them synced
        showExternalThought(data.thought, 8000);
      }
      if (data.emotion) {
        triggerEmotion(data.emotion as any);
      }
      if (data.animation) {
        triggerCodingAnimation(data.animation, 8000);
      }
    });

    // Listen for break reminders
    window.electronAPI?.onBreakReminder?.((data) => {
      console.log('[App] Break reminder:', data);
      showExternalThought(data.message, 10000);
      triggerEmotion('thinking');
    });

    // Listen for coding streak notifications
    window.electronAPI?.onCodingStreak?.((data) => {
      console.log('[App] Coding streak:', data);
      if (data.minutes >= 60) {
        showExternalThought(data.message, 5000);
        triggerEmotion('proud');
      }
    });

    // Listen for daily summary heartbeat (every 3 hours, cannot be overridden)
    window.electronAPI?.onDailySummary?.((data) => {
      console.log('[App] Daily summary heartbeat:', data);
      if (priorityMessageTimerRef.current) clearTimeout(priorityMessageTimerRef.current);
      setPriorityMessage(data.message);
      triggerEmotion('proud');
      priorityMessageTimerRef.current = setTimeout(() => {
        setPriorityMessage(null);
      }, data.duration);
    });

    // Listen for tray menu actions
    window.electronAPI?.onToggleChat?.(() => {
      setShowChat(prev => !prev);
    });

    window.electronAPI?.onClearHistory?.(() => {
      clearHistory();
    });

    window.electronAPI?.onTriggerEmotion?.((emotion) => {
      // Check if this is a coding animation (not a regular emotion)
      const codingAnimations = ['coding', 'coding_allday', 'coding_intense', 'coding_thinking', 'coding_celebrate', 'coding_focused', 'coding_typing'];
      if (codingAnimations.includes(emotion)) {
        // Trigger as a long-running coding animation (until manually changed)
        console.log('[App] Triggering coding animation from tray:', emotion);
        triggerCodingAnimation(emotion, 60 * 60 * 1000); // 1 hour - effectively permanent until changed
        showExternalThought(`Coding mode: ${emotion.replace('coding_', '').replace('coding', 'active')}~`, 3000);
      } else {
        triggerEmotion(emotion as any);
      }
    });

    window.electronAPI?.onStopCodingMode?.(() => {
      console.log('[App] Stopping coding mode');
      if (codingAnimTimerRef.current) clearTimeout(codingAnimTimerRef.current);
      if (engineRef.current) {
        (engineRef.current as any)._codingLock = false;
      }
      currentAnimRef.current = 'idle';
      frameIndexRef.current = 0;
      setIsCodingMode(false);
      showExternalThought('Back to normal~', 2000);
    });

    return () => {
      if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      if (codingAnimTimerRef.current) clearTimeout(codingAnimTimerRef.current);
      if (codingModeTimerRef.current) clearTimeout(codingModeTimerRef.current);
      if (priorityMessageTimerRef.current) clearTimeout(priorityMessageTimerRef.current);
    };
  }, [triggerEmotion, clearHistory, showExternalThought, triggerCodingAnimation]);

  useEffect(() => {
    const engine = new ShimejiEngine(window.innerWidth, window.innerHeight);
    engineRef.current = engine;
    engine.setPosition(position.x, position.y);

    engine.setCallbacks(
      (pos) => setPosition(pos),
      (state, _frame, shouldFlip) => {
        setFlip(shouldFlip);
        // Don't override animation if coding lock is active
        if ((engine as any)._codingLock) return;
        
        const animName = getAnimationForState(state);
        if (animName !== currentAnimRef.current) {
          currentAnimRef.current = animName;
          frameIndexRef.current = 0;
          frameTimerRef.current = 0;
        }
      }
    );

    const handleResize = () => engine.updateScreenSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', handleResize);

    // Listen for reset position from tray menu
    window.electronAPI?.onResetPosition?.((pos) => {
      engine.setPosition(pos.x, pos.y);
      setPosition(pos);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    const animate = (time: number) => {
      const deltaTime = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;

      engineRef.current?.update(deltaTime);

      const anim = getAnimation(currentAnimRef.current);
      if (anim) {
        frameTimerRef.current += deltaTime;
        if (frameTimerRef.current >= anim.frameDelay) {
          frameTimerRef.current = 0;
          frameIndexRef.current++;
          if (frameIndexRef.current >= anim.frames.length) {
            frameIndexRef.current = anim.loop ? 0 : anim.frames.length - 1;
          }
          setCurrentFrame(anim.frames[frameIndexRef.current]);
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  // Sprite flip logic - engine handles all flip logic based on state
  // No additional inversion needed here
  const actualFlip = flip;

  useEffect(() => {
    if (engineRef.current && !isDragging) {
      engineRef.current.setEmotion(emotion);
    }
  }, [emotion, isDragging]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 2) return;
    e.preventDefault();
    setIsDragging(true);
    engineRef.current?.startDrag();
    currentAnimRef.current = 'drag';
    frameIndexRef.current = 0;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) engineRef.current?.drag(e.clientX, e.clientY);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      engineRef.current?.endDrag();
    }
  }, [isDragging]);

  const handleDoubleClick = useCallback(() => {
    setShowChat(prev => !prev);
  }, []);

  const closeChat = useCallback(() => {
    setShowChat(false);
    if (!isHovering) {
      window.electronAPI?.setMouseEvents?.(false);
    }
  }, [isHovering]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    window.electronAPI?.setMouseEvents?.(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging && !showChat) {
      setIsHovering(false);
      window.electronAPI?.setMouseEvents?.(false);
    }
  }, [isDragging, showChat]);

  // Keep mouse events enabled when chat is open
  useEffect(() => {
    if (showChat) {
      window.electronAPI?.setMouseEvents?.(true);
    }
  }, [showChat]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Track when currentThought was last set to detect stale "Interesting..."
  const currentThoughtTimeRef = useRef<number>(0);
  const lastCurrentThoughtRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (currentThought !== lastCurrentThoughtRef.current) {
      lastCurrentThoughtRef.current = currentThought;
      currentThoughtTimeRef.current = Date.now();
    }
  }, [currentThought]);

  // Show bubble when: thinking, has thought, has external thought, or has random thought
  // Priority during coding mode:
  // Priority: priorityMessage (daily summary) > externalThought > coding thoughts > OpenClaw
  // Priority message cannot be overridden for its duration
  
  const getDisplayMessage = () => {
    // Priority message (daily summary) takes absolute highest priority - cannot be overridden
    if (priorityMessage) return priorityMessage;
    
    // External thought takes next priority
    if (externalThought) return externalThought;
    
    // Check if currentThought is a stale generic response (older than 10 seconds)
    const isStaleGenericThought = currentThought && 
      currentThought.includes('Interesting') && 
      (Date.now() - currentThoughtTimeRef.current > 10000);
    
    if (isCodingMode) {
      // During coding mode, prefer coding thoughts over generic OpenClaw responses
      if (randomThought) return randomThought;
      // Only show currentThought if it's not a generic response
      if (currentThought && !currentThought.includes('Interesting')) return currentThought;
      return null;
    }
    
    // Normal mode - OpenClaw takes priority, but suppress stale generic thoughts
    if (currentThought && !isStaleGenericThought) return currentThought;
    return randomThought || null;
  };
  
  const displayMessage = getDisplayMessage();
  
  // Debug log to see what's happening
  useEffect(() => {
    console.log('[App] Display state:', { currentThought, externalThought, randomThought, priorityMessage, notificationData, displayMessage });
  }, [currentThought, externalThought, randomThought, priorityMessage, notificationData, displayMessage]);
  
  // Show notification bubble if we have notification data, otherwise show chat bubble
  const showNotificationBubble = notificationData !== null && !priorityMessage;
  const showThinkingBubble = !showNotificationBubble && (isThinking || displayMessage);
  const isShowingReasoning = isThinking && currentThought && !currentThought.includes('My AI backend');

  return (
    <MascotLayout>
      <div
        class={`fixed select-none transition-transform duration-75 ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
        style={{ left: `${position.x}px`, top: `${position.y}px`, pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDblClick={handleDoubleClick}
      >
        <div class="relative">
          {showNotificationBubble && notificationData && (
            <NotificationBubble
              source={notificationData.source as any}
              title={notificationData.title}
              body={notificationData.body}
            />
          )}
          {showThinkingBubble && (
            <ChatBubble 
              message={displayMessage || ''} 
              isThinking={isThinking && !displayMessage} 
              isReasoning={isShowingReasoning}
            />
          )}
          <img
            src={`${SPRITE_BASE}/${currentFrame}`}
            alt="Doraemon"
            class="pointer-events-none"
            style={{ 
              transform: actualFlip ? 'scaleX(-1)' : 'none',
              width: currentFrame.startsWith('coding') ? '168px' : '128px',
              height: currentFrame.startsWith('coding') ? '168px' : '128px',
            }}
            draggable={false}
          />
          <EmotionIndicator emotion={emotion} className="absolute bottom-1 right-1" />
          
          {!isConnected && (
            <div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" title="Disconnected" />
          )}
        </div>
      </div>

      {showChat && (
        <ChatInput
          onSend={sendMessage}
          isThinking={isThinking}
          onClose={closeChat}
        />
      )}
    </MascotLayout>
  );
};

render(<App />, document.getElementById('app')!);
