import { render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { MascotLayout } from './ui/layouts';
import { ChatBubble, EmotionIndicator, ChatInput } from './ui/components/mascot';
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
      onEditorActivity: (callback: (data: { editor: string; action: string; file?: string; language?: string; thought: string }) => void) => void;
      onToggleChat: (callback: () => void) => void;
      onClearHistory: (callback: () => void) => void;
      onTriggerEmotion: (callback: (emotion: string) => void) => void;
      onWebNotification: (callback: (data: { source: string; title: string; body: string; url?: string }) => void) => void;
    };
  }
}

const App = () => {
  const [position, setPosition] = useState<Position>({ x: window.innerWidth / 2 - 64, y: window.innerHeight - 200 });
  const [currentFrame, setCurrentFrame] = useState('shime1.png');
  const [flip, setFlip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [externalThought, setExternalThought] = useState<string | null>(null);
  
  const { current: emotion } = useEmotion();
  const {
    isConnected,
    isThinking,
    currentThought,
    sendMessage,
    triggerEmotion,
    clearHistory,
  } = useOpenClaw();

  const { thought: randomThought } = useRandomThoughts(emotion, isConnected);

  const engineRef = useRef<ShimejiEngine | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameIndexRef = useRef<number>(0);
  const frameTimerRef = useRef<number>(0);
  const currentAnimRef = useRef<string>('idle');
  const externalThoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useIdleDetection();

  // Listen for notifications and editor activity
  useEffect(() => {
    const showExternalThought = (thought: string, duration = 5000) => {
      if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
      setExternalThought(thought);
      externalThoughtTimerRef.current = setTimeout(() => setExternalThought(null), duration);
    };

    window.electronAPI?.onNotification?.((data) => {
      const thought = `📱 ${data.app}: "${data.title}"${data.message ? ` - ${data.message.slice(0, 50)}...` : ''}`;
      showExternalThought(thought, 6000);
      triggerEmotion('curious');
    });

    window.electronAPI?.onEditorActivity?.((data) => {
      console.log('[App] Editor activity received:', data);
      if (data.thought) {
        showExternalThought(data.thought, 4000);
      }
    });

    // Listen for tray menu actions
    window.electronAPI?.onToggleChat?.(() => {
      setShowChat(prev => !prev);
    });

    window.electronAPI?.onClearHistory?.(() => {
      clearHistory();
    });

    window.electronAPI?.onTriggerEmotion?.((emotion) => {
      triggerEmotion(emotion as any);
    });

    // Listen for web notifications from browser extension
    window.electronAPI?.onWebNotification?.((data) => {
      const thought = `${data.title}\n${data.body}`;
      showExternalThought(thought, 8000);
      triggerEmotion('curious');
    });

    return () => {
      if (externalThoughtTimerRef.current) clearTimeout(externalThoughtTimerRef.current);
    };
  }, [triggerEmotion, clearHistory]);

  useEffect(() => {
    const engine = new ShimejiEngine(window.innerWidth, window.innerHeight);
    engineRef.current = engine;
    engine.setPosition(position.x, position.y);

    engine.setCallbacks(
      (pos) => setPosition(pos),
      (state, _frame, shouldFlip) => {
        setFlip(shouldFlip);
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

  // Show bubble when: thinking, has thought, has external thought, or has random thought
  const displayMessage = currentThought || externalThought || randomThought || null;
  const showThinkingBubble = isThinking || displayMessage;
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
            style={{ transform: actualFlip ? 'scaleX(-1)' : 'none', width: '128px', height: '128px' }}
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
