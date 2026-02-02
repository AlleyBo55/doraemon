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

type RequestFrame = { type: 'req'; id: string; method: string; params?: unknown };
type ResponseFrame = { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { message: string } };
type EventFrame = { type: 'event'; event: string; payload?: unknown; seq?: number };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

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
  const pendingRef = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map());
  const responseBufferRef = useRef('');
  const currentRunIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

  const sendWsRequest = useCallback(<T = unknown>(method: string, params?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = generateId();
      const frame: RequestFrame = { type: 'req', id, method, params };
      pendingRef.current.set(id, { resolve: (v) => resolve(v as T), reject });
      console.log('OpenClaw request:', method, params);
      wsRef.current.send(JSON.stringify(frame));
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `ws://${GATEWAY.DEFAULT_HOST}:${GATEWAY.DEFAULT_PORT}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setTimeout(async () => {
        try {
          await sendWsRequest('connect', {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'webchat-ui', displayName: 'Doraemon', version: '1.0.0', platform: 'electron', mode: 'webchat' },
            role: 'operator', scopes: ['operator.admin'], caps: ['chat.events', 'run.events'],
            auth: { token: GATEWAY.DEFAULT_TOKEN },
          });
          console.log('OpenClaw connected');
          setState(prev => ({ ...prev, isConnected: true, error: null }));
        } catch (e) {
          console.error('Connect failed:', e);
        }
      }, 800);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string };
        
        if (msg.type !== 'event' || (msg as EventFrame).event !== 'tick') {
          console.log('OpenClaw message:', event.data.slice(0, 500));
        }
        
        if (msg.type === 'event') {
          const evt = msg as EventFrame;
          
          // Handle chat events (streaming responses)
          if (evt.event === 'chat') {
            console.log('OpenClaw chat event:', evt.payload);
            const p = evt.payload as { state?: string; message?: unknown; runId?: string; content?: string; text?: string; delta?: string } | undefined;
            
            if (p?.state === 'delta' || p?.state === 'streaming') {
              const m = p.message as { content?: Array<{ text?: string }> | string } | undefined;
              let text = '';
              
              // Check for delta field first (incremental text)
              if (p.delta) {
                text = p.delta;
                responseBufferRef.current += text;
              } else {
                // For non-delta, treat content as full replacement
                if (typeof m?.content === 'string') {
                  text = m.content;
                } else if (Array.isArray(m?.content)) {
                  text = m.content.map(c => c.text || '').join('');
                } else if (p.content) {
                  text = p.content;
                } else if (p.text) {
                  text = p.text;
                }
                if (text) {
                  responseBufferRef.current = text;
                }
              }
              if (text) {
                setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
              }
            } else if (p?.state === 'final' || p?.state === 'complete' || p?.state === 'error' || p?.state === 'aborted') {
              console.log('OpenClaw chat final, buffer:', responseBufferRef.current);
              const runId = currentRunIdRef.current;
              if (runId) {
                const pending = pendingRef.current.get(runId);
                if (pending) {
                  pendingRef.current.delete(runId);
                  pending.resolve({ content: responseBufferRef.current || p.content || p.text || '' });
                }
              }
            }
          } 
          // Handle run events (alternative streaming format)
          else if (evt.event === 'run') {
            console.log('OpenClaw run event:', evt.payload);
            const p = evt.payload as { state?: string; runId?: string; content?: string; text?: string; delta?: string } | undefined;
            if (p?.state === 'streaming' || p?.state === 'delta') {
              // delta = incremental, content/text = full replacement
              if (p.delta) {
                responseBufferRef.current += p.delta;
              } else {
                const text = p.content || p.text || '';
                if (text) responseBufferRef.current = text;
              }
              setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
            } else if (p?.state === 'complete' || p?.state === 'final') {
              const runId = currentRunIdRef.current;
              if (runId) {
                const pending = pendingRef.current.get(runId);
                if (pending) {
                  pendingRef.current.delete(runId);
                  pending.resolve({ content: responseBufferRef.current || p.content || p.text || '' });
                }
              }
            }
          }
          // Handle agent events (another possible format)
          else if (evt.event === 'agent' || evt.event === 'message') {
            console.log('OpenClaw agent/message event:', evt.payload);
            const p = evt.payload as { state?: string; content?: string; text?: string; delta?: string; message?: string } | undefined;
            // delta = incremental append, others = full replacement
            if (p?.delta) {
              responseBufferRef.current += p.delta;
            } else {
              const text = p?.content || p?.text || p?.message || '';
              if (text) responseBufferRef.current = text;
            }
            if (responseBufferRef.current) {
              setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
            }
          }
        } else if (msg.type === 'res') {
          const resp = msg as ResponseFrame;
          const pending = pendingRef.current.get(resp.id);
          if (pending) {
            pendingRef.current.delete(resp.id);
            resp.ok ? pending.resolve(resp.payload) : pending.reject(new Error(resp.error?.message || 'Error'));
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      wsRef.current = null;
      pendingRef.current.forEach(p => p.reject(new Error('Disconnected')));
      pendingRef.current.clear();
      reconnectTimerRef.current = setTimeout(connect, GATEWAY.RECONNECT_DELAY);
    };

    ws.onerror = () => setState(prev => ({ ...prev, error: 'Connection error' }));
  }, [sendWsRequest]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(async (text: string): Promise<string | null> => {
    const userMessage: Message = { role: 'user', content: text, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMessage];
    
    setState(prev => ({
      ...prev,
      messages: messagesRef.current,
      isThinking: true,
      currentThought: 'Hmm, let me think~',
    }));

    emotionStore.actions.setEmotion('thinking', 'user');
    responseBufferRef.current = '';

    const runId = generateId();
    currentRunIdRef.current = runId;

    try {
      let gotResponse = false;
      const thinkingMessages = [
        'Hmm, let me think~',
        'Processing...',
        'Still thinking...',
        'Almost there...',
        'Connecting to AI...',
        'Waiting for response...',
        'Hmm, taking a bit longer...',
        'One more moment~',
      ];
      
      const eventPromise = new Promise<string>((resolve) => {
        let checkCount = 0;
        const maxChecks = 12; // Extended to 12 seconds
        
        const checkInterval = setInterval(() => {
          checkCount++;
          
          // Only update thinking message if we don't have streaming content
          if (!responseBufferRef.current) {
            setState(prev => ({ 
              ...prev, 
              currentThought: thinkingMessages[Math.min(checkCount - 1, thinkingMessages.length - 1)] 
            }));
          }
          
          // Check if we got a response in the buffer
          if (responseBufferRef.current && responseBufferRef.current.length > 20) {
            clearInterval(checkInterval);
            gotResponse = true;
            resolve(responseBufferRef.current);
            return;
          }
          
          // Timeout after maxChecks seconds
          if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
            resolve(responseBufferRef.current || '');
          }
        }, 1000);
        
        // Also resolve immediately if we get an event
        pendingRef.current.set(runId, {
          resolve: (v) => { 
            clearInterval(checkInterval);
            gotResponse = true;
            resolve((v as { content?: string }).content || responseBufferRef.current || ''); 
          },
          reject: () => { 
            clearInterval(checkInterval); 
            resolve(responseBufferRef.current || ''); 
          },
        });
      });

      // Send chat message
      const sendResult = await sendWsRequest<{ runId?: string; status?: string }>('chat.send', { 
        sessionKey: 'main', 
        message: text, 
        deliver: true,
        idempotencyKey: runId 
      });
      console.log('OpenClaw chat.send result:', sendResult);

      // Wait for events with polling
      const eventResponse = await eventPromise;
      
      if (eventResponse || gotResponse) {
        const content = eventResponse || responseBufferRef.current;
        if (content) {
          const assistantMessage: Message = { role: 'assistant', content, timestamp: Date.now() };
          messagesRef.current = [...messagesRef.current, assistantMessage];
          setState(prev => ({
            ...prev,
            messages: messagesRef.current,
            isThinking: false,
            currentThought: extractThought(content),
            error: null,
          }));
          emotionStore.actions.setEmotion(detectEmotion(content), 'ai');
          setTimeout(() => setState(prev => ({ ...prev, currentThought: null })), 8000);
          return content;
        }
      }

      // No response from OpenClaw events - show friendly message
      console.log('No chat events received from OpenClaw');
      const fallbackMsg = "I'm connected but my AI brain isn't responding yet~ Check OpenClaw's AI backend config!";
      
      const assistantMessage: Message = { role: 'assistant', content: fallbackMsg, timestamp: Date.now() };
      messagesRef.current = [...messagesRef.current, assistantMessage];

      setState(prev => ({
        ...prev,
        messages: messagesRef.current,
        isThinking: false,
        currentThought: 'My AI backend needs setup~',
        error: null,
      }));

      emotionStore.actions.setEmotion('confused', 'ai');
      setTimeout(() => setState(prev => ({ ...prev, currentThought: null })), 5000);
      return fallbackMsg;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Chat error:', errorMsg);
      
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
    } finally {
      currentRunIdRef.current = null;
    }
  }, [sendWsRequest]);

  const triggerEmotion = useCallback((emotion: EmotionType) => {
    emotionStore.actions.setEmotion(emotion, 'user');
    const thoughts: Record<EmotionType, string> = {
      happy: 'Yatta~! 🎉', sad: 'Oh no...', excited: 'This is amazing!',
      thinking: 'Hmm, let me think...', confused: 'Eh?! What happened?',
      sleepy: '*yawn* So sleepy~', surprised: 'Wow! Unexpected!',
      working: 'Working on it~', frustrated: 'Mou~ This is difficult!',
      proud: 'I did it! ✨', curious: 'Interesting...', playful: 'Hehe~ Fun!',
      determined: "I won't give up!", relaxed: 'Ahh~ So peaceful~',
      anxious: 'I hope this works...', neutral: '',
    };
    if (thoughts[emotion]) {
      setState(prev => ({ ...prev, currentThought: thoughts[emotion] }));
      setTimeout(() => setState(prev => ({ ...prev, currentThought: null })), 3000);
    }
  }, []);

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setState(prev => ({ ...prev, messages: [], currentThought: 'Fresh start~!' }));
    setTimeout(() => setState(prev => ({ ...prev, currentThought: null })), 2000);
  }, []);

  return { ...state, sendMessage, triggerEmotion, clearHistory };
};
