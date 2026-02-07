/**
 * useChat - Direct HTTP chat hook (replaces useOpenClaw WebSocket)
 *
 * Calls the Cloudflare Worker proxy via simple HTTP POST.
 * No WebSocket, no OpenClaw dependency.
 */

import { useState, useCallback, useRef } from 'preact/hooks';
import { emotionStore, configState } from '../stores';
import { detectEmotion, extractThought } from '../services/openclaw';
import type { EmotionType } from '../core/types/emotion';
import { DORAEMON_SOUL, getRandomCatchphrase } from '../core/constants/soul';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type ChatState = {
  isConnected: boolean;
  isThinking: boolean;
  messages: Message[];
  currentThought: string | null;
  error: string | null;
  agentMode: 'chat' | 'agent';
  currentTool: null;
  isAgentRunning: false;
};

const PROXY_URL = (import.meta as any).env?.VITE_PROXY_URL || 'https://doraemon-proxy.doraboss.workers.dev';
const MAX_HISTORY = 10;

function getDeviceId(): string {
  const KEY = 'doraemon-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
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
      }
    }).electronAPI;

    if (electronAPI?.memoryGetContext) {
      return (await electronAPI.memoryGetContext(query)) || '';
    }
  } catch {}
  return '';
}

async function callProxy(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  deviceId: string
): Promise<{ content: string; remaining: number } | { error: string }> {
  const proxyUrl = configState.proxyUrl?.value || PROXY_URL;

  const response = await fetch(`${proxyUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, deviceId }),
  });

  if (response.status === 429) {
    const data = await response.json() as { error: string; resetsAt?: string };
    return { error: data.error || 'Rate limit reached for today~' };
  }

  if (!response.ok) {
    return { error: `Server error (${response.status})` };
  }

  const data = await response.json() as { content: string; remaining: number };
  return data;
}

export const useChat = () => {
  const [state, setState] = useState<ChatState>({
    isConnected: true,
    isThinking: false,
    messages: [],
    currentThought: null,
    error: null,
    agentMode: 'chat',
    currentTool: null,
    isAgentRunning: false,
  });

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

  const sendMessage = useCallback(async (text: string): Promise<string | null> => {
    clearBubbleTimeout();
    const userMessage: Message = { role: 'user', content: text, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMessage];

    // Notify main process for mood/bond tracking
    try {
      const electronAPI = (window as unknown as { electronAPI?: { notifyChatMessage?: (msg: string) => void } }).electronAPI;
      electronAPI?.notifyChatMessage?.(text);
    } catch {}

    setState(prev => ({
      ...prev,
      messages: messagesRef.current,
      isThinking: true,
      currentThought: 'Hmm, let me think~',
      error: null,
    }));

    emotionStore.actions.setEmotion('thinking', 'user');

    let messageWithContext = text;
    try {
      const memoryContext = await getMemoryContext(text);
      if (memoryContext) {
        messageWithContext = `${memoryContext}\n\nUser message: ${text}`;
      }
    } catch {}

    try {
      const history = messagesRef.current
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.role === 'user' && m === userMessage ? messageWithContext : m.content }));

      const result = await callProxy(history, getDeviceId());

      if ('error' in result) {
        const fallback = result.error.includes('Rate limit')
          ? "Mou~ I've used up my energy for today. Let's chat again tomorrow~ 💤"
          : `Mou~ Something went wrong: ${result.error}`;

        const assistantMessage: Message = { role: 'assistant', content: fallback, timestamp: Date.now() };
        messagesRef.current = [...messagesRef.current, assistantMessage];

        setState(prev => ({
          ...prev,
          messages: messagesRef.current,
          isThinking: false,
          currentThought: extractThought(fallback),
          error: result.error,
        }));

        emotionStore.actions.setEmotionProtected('frustrated', 'ai');
        setBubbleTimeout();
        return fallback;
      }

      const { content } = result;
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
      setBubbleTimeout();
      learnFromConversation(text, content);
      return content;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      setState(prev => ({
        ...prev,
        isThinking: false,
        currentThought: 'Mou~ Something went wrong...',
        error: errorMsg,
      }));

      emotionStore.actions.setEmotionProtected('confused', 'ai');
      setBubbleTimeout();
      return null;
    }
  }, [clearBubbleTimeout, setBubbleTimeout]);

  const triggerEmotion = useCallback((emotion: EmotionType) => {
    emotionStore.actions.setEmotion(emotion, 'user');
    const thoughts: Record<EmotionType, string> = {
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
      setBubbleTimeout();
    }
  }, [setBubbleTimeout]);

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setState(prev => ({ ...prev, messages: [], currentThought: getRandomCatchphrase() }));
    setBubbleTimeout();
  }, [setBubbleTimeout]);

  const getModelMode = useCallback(() => configState.modelMode.value, []);

  const setAgentMode = useCallback(() => {}, []);
  const toggleAgentMode = useCallback(() => {}, []);

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
