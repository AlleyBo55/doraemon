import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { emotionStore } from '../stores';
import { detectEmotion, extractThought } from '../services/openclaw';
import type { EmotionType } from '../core/types/emotion';
import { GATEWAY } from '../core/constants/gateway';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type OpenClawState = {
  isConnected: boolean;
  isThinking: boolean;
  messages: Message[];
  currentThought: string | null;
  error: string | null;
};

export const useOpenClaw = () => {
  const [state, setState] = useState<OpenClawState>({
    isConnected: false,
    isThinking: false,
    messages: [],
    currentThought: null,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(`doraemon-${Date.now()}`);
  const pendingResolveRef = useRef<((content: string) => void) | null>(null);
  const responseBufferRef = useRef('');

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `ws://${GATEWAY.DEFAULT_HOST}:${GATEWAY.DEFAULT_PORT}`;
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        
        // Send auth message
        ws.send(JSON.stringify({
          type: 'auth',
          token: GATEWAY.DEFAULT_TOKEN,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // Handle different message types
          switch (msg.type) {
            case 'auth_ok':
              console.log('OpenClaw authenticated');
              break;
              
            case 'chunk':
            case 'stream':
              // Streaming response chunk
              if (msg.content) {
                responseBufferRef.current += msg.content;
                setState(prev => ({
                  ...prev,
                  currentThought: extractThought(responseBufferRef.current) || prev.currentThought,
                }));
              }
              break;
              
            case 'response':
            case 'message':
            case 'complete':
              // Final response
              const content = msg.content || msg.message || msg.text || responseBufferRef.current;
              if (pendingResolveRef.current && content) {
                pendingResolveRef.current(content);
                pendingResolveRef.current = null;
              }
              responseBufferRef.current = '';
              break;
              
            case 'error':
              console.error('OpenClaw error:', msg.message || msg.error);
              if (pendingResolveRef.current) {
                pendingResolveRef.current('');
                pendingResolveRef.current = null;
              }
              break;
          }
        } catch {
          // Try plain text response
          if (event.data && typeof event.data === 'string' && !event.data.startsWith('{')) {
            responseBufferRef.current += event.data;
          }
        }
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isConnected: false }));
        wsRef.current = null;
        reconnectTimerRef.current = setTimeout(connect, GATEWAY.RECONNECT_DELAY);
      };

      ws.onerror = () => {
        setState(prev => ({ ...prev, error: 'Connection error' }));
      };
    } catch {
      setState(prev => ({ ...prev, isConnected: false, error: 'Failed to connect' }));
    }
  }, []);

  const sendMessage = useCallback(async (text: string): Promise<string | null> => {
    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isThinking: true,
      currentThought: 'Hmm, let me think~',
    }));

    emotionStore.actions.setEmotion('thinking', 'user');
    responseBufferRef.current = '';

    try {
      // Wait for response via promise
      const responseContent = await new Promise<string>((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error('Not connected'));
          return;
        }

        pendingResolveRef.current = resolve;

        // Send message to OpenClaw
        wsRef.current.send(JSON.stringify({
          type: 'message',
          content: text,
          sessionId: sessionIdRef.current,
        }));

        // Timeout after 60 seconds
        setTimeout(() => {
          if (pendingResolveRef.current) {
            const buffered = responseBufferRef.current;
            pendingResolveRef.current = null;
            if (buffered) {
              resolve(buffered);
            } else {
              reject(new Error('Request timeout'));
            }
          }
        }, 60000);
      });

      if (!responseContent) {
        throw new Error('Empty response');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
      };

      const detectedEmotion = detectEmotion(responseContent);
      const thought = extractThought(responseContent);

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isThinking: false,
        currentThought: thought,
        error: null,
      }));

      emotionStore.actions.setEmotion(detectedEmotion, 'ai');

      setTimeout(() => {
        setState(prev => ({ ...prev, currentThought: null }));
      }, 5000);

      return responseContent;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      setState(prev => ({
        ...prev,
        isThinking: false,
        currentThought: 'Mou~ Something went wrong...',
        error: errorMsg,
      }));

      emotionStore.actions.setEmotion('confused', 'ai');

      setTimeout(() => {
        setState(prev => ({ ...prev, currentThought: null }));
        emotionStore.actions.setEmotion('neutral', 'idle');
      }, 3000);

      return null;
    }
  }, []);

  const triggerEmotion = useCallback((emotion: EmotionType) => {
    emotionStore.actions.setEmotion(emotion, 'user');
    
    const thoughts: Record<EmotionType, string> = {
      happy: 'Yatta~! 🎉',
      sad: 'Oh no...',
      excited: 'This is amazing!',
      thinking: 'Hmm, let me think...',
      confused: 'Eh?! What happened?',
      sleepy: '*yawn* So sleepy~',
      surprised: 'Wow! Unexpected!',
      working: 'Working on it~',
      frustrated: 'Mou~ This is difficult!',
      proud: 'I did it! ✨',
      curious: 'Interesting...',
      playful: 'Hehe~ Fun!',
      determined: "I won't give up!",
      relaxed: 'Ahh~ So peaceful~',
      anxious: 'I hope this works...',
      neutral: '',
    };

    if (thoughts[emotion]) {
      setState(prev => ({ ...prev, currentThought: thoughts[emotion] }));
      setTimeout(() => {
        setState(prev => ({ ...prev, currentThought: null }));
      }, 3000);
    }
  }, []);

  const clearHistory = useCallback(() => {
    sessionIdRef.current = `doraemon-${Date.now()}`;
    setState(prev => ({
      ...prev,
      messages: [],
      currentThought: 'Fresh start~!',
    }));
    
    setTimeout(() => {
      setState(prev => ({ ...prev, currentThought: null }));
    }, 2000);
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    ...state,
    sendMessage,
    triggerEmotion,
    clearHistory,
  };
};
