import { render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { MascotLayout } from './ui/layouts';
import { ChatBubble, EmotionIndicator, ChatInput, ContextMenu } from './ui/components/mascot';
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
    };
  }
}

const App = () => {
  const [position, setPosition] = useState<Position>({ x: window.innerWidth / 2 - 64, y: window.innerHeight - 200 });
  const [currentFrame, setCurrentFrame] = useState('shime1.png');
  const [flip, setFlip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  
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

  useIdleDetection();

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

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeChat = useCallback(() => {
    setShowChat(false);
    window.electronAPI?.setMouseEvents?.(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setShowChat(prev => {
      const newState = !prev;
      if (newState) {
        window.electronAPI?.setMouseEvents?.(true);
        window.electronAPI?.focusWindow?.();
      } else {
        window.electronAPI?.setMouseEvents?.(false);
      }
      return newState;
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    window.electronAPI?.setMouseEvents?.(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging && !contextMenu && !showChat) {
      setIsHovering(false);
      window.electronAPI?.setMouseEvents?.(false);
    }
  }, [isDragging, contextMenu, showChat]);

  // Keep mouse events enabled when chat or context menu is open
  useEffect(() => {
    if (showChat || contextMenu) {
      window.electronAPI?.setMouseEvents?.(true);
    }
  }, [showChat, contextMenu]);

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

  const displayMessage = currentThought || randomThought || null;

  return (
    <MascotLayout>
      <div
        class={`fixed select-none transition-transform duration-75 ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDblClick={handleDoubleClick}
      >
        <div class="relative">
          {displayMessage && (
            <ChatBubble message={displayMessage} isThinking={isThinking} />
          )}
          <img
            src={`${SPRITE_BASE}/${currentFrame}`}
            alt="Doraemon"
            class="pointer-events-none"
            style={{ transform: flip ? 'scaleX(-1)' : 'none', width: '128px', height: '128px' }}
            draggable={false}
          />
          <EmotionIndicator emotion={emotion} className="absolute bottom-1 right-1" />
          
          {!isConnected && (
            <div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" title="Disconnected" />
          )}
        </div>
      </div>

      {showChat && (
        <div 
          class="fixed bottom-4 left-4"
          onMouseEnter={() => window.electronAPI?.setMouseEvents?.(true)}
        >
          <ChatInput
            onSend={sendMessage}
            isThinking={isThinking}
            onClose={closeChat}
          />
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onTriggerEmotion={triggerEmotion}
          onClearHistory={clearHistory}
          onToggleChat={() => setShowChat(prev => !prev)}
        />
      )}
    </MascotLayout>
  );
};

render(<App />, document.getElementById('app')!);
