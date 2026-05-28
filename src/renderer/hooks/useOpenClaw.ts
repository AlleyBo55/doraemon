import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { animationStore, emotionStore, configState } from '../stores';
import { detectEmotion, extractThought } from '../services/openclaw';
import type { EmotionType } from '../core/types/emotion';
import { GATEWAY } from '../core/constants/gateway';
import { DORAEMON_SOUL, getRandomCatchphrase } from '../core/constants/soul';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type ToolEvent = {
  tool: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
};

type AgentMode = 'chat' | 'agent';

type OpenClawState = {
  isConnected: boolean;
  isThinking: boolean;
  messages: Message[];
  currentThought: string | null;
  error: string | null;
  agentMode: AgentMode;
  currentTool: ToolEvent | null;
  isAgentRunning: boolean;
};

type RequestFrame = { type: 'req'; id: string; method: string; params?: unknown };
type ResponseFrame = { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { message: string } };
type EventFrame = { type: 'event'; event: string; payload?: unknown; seq?: number };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function learnFromConversation(userMessage: string, assistantResponse: string): void {
  if (userMessage.length < 15 || assistantResponse.length < 30) return;
  
  const skipPatterns = [
    /^(hi|hello|hey|thanks|ok|yes|no|bye|good|nice)/i,
    /^(what time|how are you|who are you)/i,
  ];
  
  for (const pattern of skipPatterns) {
    if (pattern.test(userMessage.trim())) return;
  }
  
  try {
    const electronAPI = (window as unknown as { electronAPI?: { memoryLearn?: (input: unknown) => Promise<unknown> } }).electronAPI;
    if (electronAPI?.memoryLearn) {
      const summary = `Q: ${userMessage.substring(0, 100)}... A: ${assistantResponse.substring(0, 150)}...`;
      electronAPI.memoryLearn({
        content: summary,
        category: 'interaction',
        source: 'conversation',
      }).catch(() => {});
    }
  } catch {}
}

async function getMemoryContext(query: string): Promise<string> {
  try {
    const electronAPI = (window as unknown as { 
      electronAPI?: { 
        memoryGetContext?: (query: string) => Promise<string>;
        memoryGetPredictions?: () => Promise<string[]>;
      } 
    }).electronAPI;
    
    if (electronAPI?.memoryGetContext) {
      const context = await electronAPI.memoryGetContext(query);
      return context || '';
    }
  } catch {}
  return '';
}

export const useOpenClaw = () => {
  const [state, setState] = useState<OpenClawState>({
    isConnected: false,
    isThinking: false,
    messages: [],
    currentThought: null,
    error: null,
    agentMode: 'agent',
    currentTool: null,
    isAgentRunning: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map());
  const responseBufferRef = useRef('');
  const currentRunIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBubbleTimeout = useCallback(() => {
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
      bubbleTimeoutRef.current = null;
    }
  }, []);

  const setBubbleTimeout = useCallback((delay = 50000) => {
    clearBubbleTimeout();
    bubbleTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, currentThought: null }));
    }, delay);
  }, [clearBubbleTimeout]);

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
          // Handle agent events (tool use, lifecycle)
          else if (evt.event === 'agent') {
            const p = evt.payload as { 
              stream?: string; 
              data?: { 
                tool?: string; 
                phase?: string; 
                text?: string;
                error?: unknown;
              };
              runId?: string;
            } | undefined;
            
            // Tool events - show what the agent is doing
            if (p?.stream === 'tool' && p.data?.tool) {
              const toolName = p.data.tool;
              setState(prev => ({
                ...prev,
                currentTool: { tool: toolName, status: 'running', timestamp: Date.now() },
                currentThought: `Using ${toolName}...`,
                isAgentRunning: true,
              }));
            }
            // Lifecycle events
            else if (p?.stream === 'lifecycle') {
              if (p.data?.phase === 'start') {
                setState(prev => ({ ...prev, isAgentRunning: true }));
              } else if (p.data?.phase === 'end' || p.data?.phase === 'error') {
                setState(prev => ({ 
                  ...prev, 
                  isAgentRunning: false, 
                  currentTool: null,
                }));
              }
            }
            // Assistant text stream
            else if (p?.stream === 'assistant' && p.data?.text) {
              responseBufferRef.current = p.data.text;
              setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
            }
          }
          // Handle message events (legacy format)
          else if (evt.event === 'message') {
            console.log('OpenClaw message event:', evt.payload);
            const p = evt.payload as { content?: string; text?: string; delta?: string; message?: string } | undefined;
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
    clearBubbleTimeout();
    const userMessage: Message = { role: 'user', content: text, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMessage];
    
    setState(prev => ({
      ...prev,
      messages: messagesRef.current,
      isThinking: true,
      currentThought: 'Hmm, let me think~',
    }));

    emotionStore.actions.setEmotion('contemplation', 'user');
    animationStore.actions.trigger('action_chat_question', 7000);
    responseBufferRef.current = '';

    const runId = generateId();
    currentRunIdRef.current = runId;

    // RAG: Inject memory context before sending
    let messageWithContext = text;
    try {
      const memoryContext = await getMemoryContext(text);
      if (memoryContext) {
        messageWithContext = `${memoryContext}\n\nUser message: ${text}`;
      }
    } catch {}

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
        'Still working on it~',
        'Almost done~',
      ];
      
      const eventPromise = new Promise<string>((resolve) => {
        let checkCount = 0;
        const maxChecks = 30; // Extended to 30 seconds for slower responses
        
        const checkInterval = setInterval(() => {
          checkCount++;
          
          // Only update thinking message if we don't have streaming content
          if (!responseBufferRef.current) {
            setState(prev => ({ 
              ...prev, 
              currentThought: thinkingMessages[Math.min(checkCount - 1, thinkingMessages.length - 1)] 
            }));
          }
          
          // Check if we got a response in the buffer (at least some content)
          if (responseBufferRef.current && responseBufferRef.current.length > 10) {
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

      // Send chat message with memory context injected
      const sendResult = await sendWsRequest<{ runId?: string; status?: string }>('chat.send', { 
        sessionKey: 'main', 
        message: messageWithContext, 
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
          emotionStore.actions.setEmotionProtected(detectEmotion(content), 'ai');
          animationStore.actions.trigger('action_chat_answer', 9000);
          setBubbleTimeout(50000);
          
          // Learn from conversation (secure memory system)
          learnFromConversation(text, content);
          
          return content;
        }
      }

      // No response from OpenClaw events - show friendly message
      // But only if we really got nothing (check buffer one more time)
      if (responseBufferRef.current && responseBufferRef.current.length > 10) {
        const content = responseBufferRef.current;
        const assistantMessage: Message = { role: 'assistant', content, timestamp: Date.now() };
        messagesRef.current = [...messagesRef.current, assistantMessage];
        setState(prev => ({
          ...prev,
          messages: messagesRef.current,
          isThinking: false,
          currentThought: extractThought(content),
          error: null,
        }));
        emotionStore.actions.setEmotionProtected(detectEmotion(content), 'ai');
        animationStore.actions.trigger('action_chat_answer', 9000);
        setBubbleTimeout(50000);
        
        // Learn from conversation (secure memory system)
        learnFromConversation(text, content);
        
        return content;
      }

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

      emotionStore.actions.setEmotionProtected('confusion', 'ai');
      animationStore.actions.trigger('emotion_confusion', 8000);
      setBubbleTimeout(50000);
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

      emotionStore.actions.setEmotionProtected('confusion', 'ai');
      animationStore.actions.trigger('emotion_confusion', 8000);
      setBubbleTimeout(50000);

      return null;
    } finally {
      currentRunIdRef.current = null;
    }
  }, [sendWsRequest, clearBubbleTimeout, setBubbleTimeout]);

  const triggerEmotion = useCallback((emotion: EmotionType) => {
    emotionStore.actions.setEmotion(emotion, 'user');
    const thoughts: Partial<Record<EmotionType, string>> = {
      joy: `${DORAEMON_SOUL.speechPatterns.exclamations.happy} 🎉`,
      pride: 'I did it! ✨',
      satisfaction: 'Ahh~ That feels complete.',
      curiosity: 'Interesting...',
      wonder: 'Wow! Look at that!',
      determination: "I won't give up!",
      focus: 'Working on it~',
      calm: 'Ahh~ So peaceful~',
      contemplation: `${DORAEMON_SOUL.speechPatterns.exclamations.thinking} Let me think...`,
      concern: 'I hope this works...',
      frustration: `${DORAEMON_SOUL.speechPatterns.exclamations.frustrated} This is difficult!`,
      fatigue: '*yawn* So sleepy~',
      longing: 'I miss my friends...',
      gratitude: 'Thank you~',
      connection: 'Hello there~',
      confusion: `${DORAEMON_SOUL.speechPatterns.exclamations.surprised} What happened?`,
      excitement: 'This is amazing!',
      melancholy: 'Oh no...',
      hope: 'Maybe we can still make it work.',
      awe: 'That is incredible!',
      angry: 'Mou~ That is not okay!',
      hungry: 'Dorayaki would help right now...',
      happy: `${DORAEMON_SOUL.speechPatterns.exclamations.happy} 🎉`,
      sad: 'Oh no...',
      excited: 'This is amazing!',
      thinking: `${DORAEMON_SOUL.speechPatterns.exclamations.thinking} Let me think...`,
      confused: `${DORAEMON_SOUL.speechPatterns.exclamations.surprised} What happened?`,
      sleepy: '*yawn* So sleepy~',
      surprised: 'Wow! Unexpected!',
      working: 'Working on it~',
      frustrated: `${DORAEMON_SOUL.speechPatterns.exclamations.frustrated} This is difficult!`,
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
      setBubbleTimeout(50000);
    }
  }, [setBubbleTimeout]);

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setState(prev => ({ ...prev, messages: [], currentThought: getRandomCatchphrase() }));
    setBubbleTimeout(50000);
  }, [setBubbleTimeout]);

  const getModelMode = useCallback(() => configState.modelMode.value, []);

  const setAgentMode = useCallback((mode: AgentMode) => {
    setState(prev => ({ ...prev, agentMode: mode }));
  }, []);

  const toggleAgentMode = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      agentMode: prev.agentMode === 'chat' ? 'agent' : 'chat' 
    }));
  }, []);

  return { 
    ...state, 
    sendMessage, 
    triggerEmotion, 
    clearHistory, 
    getModelMode,
    setAgentMode,
    toggleAgentMode,
  };
};
