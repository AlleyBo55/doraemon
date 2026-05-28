/**
 * useChat - Hybrid chat hook with intent-based routing
 *
 * General chat → CF Worker proxy (fast, cheap)
 * Tool intents → OpenClaw gateway via WebSocket (skill-specific routing)
 */

import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { animationStore, emotionStore, configState } from '../stores';
import { detectEmotion, extractThought } from '../services/openclaw';
import { routeMessage } from '../services/routing/tool-router';
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

type InboundMessage = {
  from: string;
  body: string;
  channel: string;
  timestamp: number;
  chatId?: string;
  isGroup?: boolean;
};

type ChatState = {
  isConnected: boolean;
  isThinking: boolean;
  messages: Message[];
  currentThought: string | null;
  error: string | null;
  agentMode: 'chat' | 'agent';
  currentTool: ToolEvent | null;
  isAgentRunning: boolean;
  lastInbound: InboundMessage | null;
};

type RequestFrame = { type: 'req'; id: string; method: string; params?: unknown };
type ResponseFrame = { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { message: string } };
type EventFrame = { type: 'event'; event: string; payload?: unknown; seq?: number };

const PROXY_URL = (import.meta as any).env?.VITE_PROXY_URL || 'https://doraemon-proxy.doraboss.workers.dev';
const MAX_HISTORY = 10;
const OPENCLAW_RESPONSE_TIMEOUT = 30;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

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

type ParsedOutbound = { to: string; body: string; channel: string };

function logToConversationDb(entry: { direction: string; from: string; to: string; channel: string; body: string; tokens?: { input: number; output: number; total: number; model?: string; durationMs?: number } }): void {
  try {
    const api = (window as unknown as { electronAPI?: { logConversation?: (e: typeof entry) => Promise<void> } }).electronAPI;
    api?.logConversation?.(entry)?.catch(() => {});
  } catch {}
}

function parseOutboundMessage(text: string): ParsedOutbound | null {
  // "send message to +628xxx on whatsapp saying hello"
  // "whatsapp +628xxx hello there"
  // "text +628xxx on telegram hey"
  // "send to +628xxx hello"

  const channelMap: Record<string, string> = {
    whatsapp: 'whatsapp', wa: 'whatsapp',
    telegram: 'telegram', tg: 'telegram',
    discord: 'discord',
    slack: 'slack',
    signal: 'signal',
    imessage: 'imessage',
  };

  const normalized = text.trim();

  // Pattern: "send message to <number> on <channel> saying <body>"
  const fullPattern = /(?:send|text|message)\s+(?:(?:a\s+)?message\s+)?to\s+(\+?[\d\s-]+)\s+(?:on|via)\s+(\w+)\s+(?:saying|with|:)?\s*(.+)/i;
  let match = normalized.match(fullPattern);
  if (match) {
    const to = match[1].replace(/[\s-]/g, '');
    const channel = channelMap[match[2].toLowerCase()] || 'whatsapp';
    const body = match[3].trim();
    if (to && body) return { to, body, channel };
  }

  // Pattern: "send to <number> <body>" (defaults to whatsapp)
  const sendToPattern = /(?:send|text)\s+to\s+(\+?[\d\s-]+)\s+(.+)/i;
  match = normalized.match(sendToPattern);
  if (match) {
    const to = match[1].replace(/[\s-]/g, '');
    const body = match[2].trim();
    if (to && body) return { to, body, channel: 'whatsapp' };
  }

  // Pattern: "<channel> <number> <body>"
  const channelFirstPattern = /^(whatsapp|wa|telegram|tg|discord|slack|signal|imessage)\s+(\+?[\d\s-]+)\s+(.+)/i;
  match = normalized.match(channelFirstPattern);
  if (match) {
    const channel = channelMap[match[1].toLowerCase()] || 'whatsapp';
    const to = match[2].replace(/[\s-]/g, '');
    const body = match[3].trim();
    if (to && body) return { to, body, channel };
  }

  // Pattern: "reply to <number> on <channel> <body>"
  const replyPattern = /reply\s+(?:to\s+)?(\+?[\d\s-]+)\s+(?:on|via)\s+(\w+)\s+(.+)/i;
  match = normalized.match(replyPattern);
  if (match) {
    const to = match[1].replace(/[\s-]/g, '');
    const channel = channelMap[match[2].toLowerCase()] || 'whatsapp';
    const body = match[3].trim();
    if (to && body) return { to, body, channel };
  }

  return null;
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

  return await response.json() as { content: string; remaining: number };
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
    lastInbound: null,
  });

  const messagesRef = useRef<Message[]>([]);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // OpenClaw WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const wsReconnectAttemptsRef = useRef(0);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openclawUrlRef = useRef<string | null>(null);
  const debugConversationRef = useRef(false);
  const pendingRef = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map());
  const responseBufferRef = useRef('');
  const currentRunIdRef = useRef<string | null>(null);
  const lastTokenUsageRef = useRef<{ input: number; output: number; total: number; model?: string; durationMs?: number } | null>(null);
  const lastInboundFromRef = useRef<string | null>(null);
  const lastInboundChannelRef = useRef<string>('whatsapp');

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

  // ── OpenClaw WebSocket management ──

  const sendWsRequest = useCallback(<T = unknown>(method: string, params?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('OpenClaw not connected'));
        return;
      }
      const id = generateId();
      const frame: RequestFrame = { type: 'req', id, method, params };
      pendingRef.current.set(id, { resolve: (v) => resolve(v as T), reject });
      wsRef.current.send(JSON.stringify(frame));
    });
  }, []);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as { type?: string };

      if (msg.type === 'event') {
        const evt = msg as EventFrame;

        if (evt.event === 'chat') {
          const p = evt.payload as {
            state?: string;
            message?: unknown;
            content?: string;
            text?: string;
            delta?: string;
            sessionKey?: string;
            from?: string;
            channel?: string;
            chatId?: string;
            isGroup?: boolean;
            usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
            model?: string;
            durationMs?: number;
          } | undefined;

          // Detect inbound messages from channels
          if (p?.state === 'inbound' && p.from) {
            const inbound: InboundMessage = {
              from: p.from,
              body: p.content || p.text || '',
              channel: p.channel || 'whatsapp',
              timestamp: Date.now(),
              chatId: p.chatId,
              isGroup: p.isGroup,
            };
            setState(prev => ({ ...prev, lastInbound: inbound }));
            lastInboundFromRef.current = p.from;
            lastInboundChannelRef.current = p.channel || 'whatsapp';
            console.log('[useChat] Inbound message:', inbound);
            if (debugConversationRef.current) {
              logToConversationDb({ direction: 'inbound', from: inbound.from, to: 'doraemon', channel: inbound.channel, body: inbound.body });
            }
          } else if (p?.state === 'delta' || p?.state === 'streaming') {
            const m = p.message as { content?: Array<{ text?: string }> | string } | undefined;
            if (p.delta) {
              responseBufferRef.current += p.delta;
            } else {
              let text = '';
              if (typeof m?.content === 'string') text = m.content;
              else if (Array.isArray(m?.content)) text = m.content.map(c => c.text || '').join('');
              else if (p.content) text = p.content;
              else if (p.text) text = p.text;
              if (text) responseBufferRef.current = text;
            }
            if (responseBufferRef.current) {
              setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
            }
          } else if (p?.state === 'final' || p?.state === 'complete' || p?.state === 'error' || p?.state === 'aborted') {
            // Capture token usage if present
            if (p.usage) {
              const inputTok = p.usage.input_tokens ?? p.usage.prompt_tokens ?? 0;
              const outputTok = p.usage.output_tokens ?? p.usage.completion_tokens ?? 0;
              lastTokenUsageRef.current = {
                input: inputTok,
                output: outputTok,
                total: inputTok + outputTok,
                model: p.model,
                durationMs: p.durationMs,
              };
            }

            // Log auto-reply outbound with token usage
            if (debugConversationRef.current && responseBufferRef.current && lastInboundFromRef.current) {
              logToConversationDb({
                direction: 'outbound',
                from: 'doraemon',
                to: lastInboundFromRef.current,
                channel: lastInboundChannelRef.current,
                body: responseBufferRef.current,
                tokens: lastTokenUsageRef.current || undefined,
              });
              lastInboundFromRef.current = null;
              lastTokenUsageRef.current = null;
            }

            const runId = currentRunIdRef.current;
            if (runId) {
              const pending = pendingRef.current.get(runId);
              if (pending) {
                pendingRef.current.delete(runId);
                pending.resolve({ content: responseBufferRef.current || p.content || p.text || '' });
              }
            }
          }
        } else if (evt.event === 'run') {
          const p = evt.payload as {
            state?: string;
            content?: string;
            text?: string;
            delta?: string;
            usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
            model?: string;
            durationMs?: number;
          } | undefined;
          if (p?.state === 'streaming' || p?.state === 'delta') {
            if (p.delta) responseBufferRef.current += p.delta;
            else {
              const text = p.content || p.text || '';
              if (text) responseBufferRef.current = text;
            }
            setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
          } else if (p?.state === 'complete' || p?.state === 'final') {
            if (p.usage) {
              const inputTok = p.usage.input_tokens ?? p.usage.prompt_tokens ?? 0;
              const outputTok = p.usage.output_tokens ?? p.usage.completion_tokens ?? 0;
              lastTokenUsageRef.current = {
                input: inputTok,
                output: outputTok,
                total: inputTok + outputTok,
                model: p.model,
                durationMs: p.durationMs,
              };
            }
            const runId = currentRunIdRef.current;
            if (runId) {
              const pending = pendingRef.current.get(runId);
              if (pending) {
                pendingRef.current.delete(runId);
                pending.resolve({ content: responseBufferRef.current || p.content || p.text || '' });
              }
            }
          }
        } else if (evt.event === 'agent') {
          const p = evt.payload as {
            stream?: string;
            data?: { tool?: string; phase?: string; text?: string };
          } | undefined;

          if (p?.stream === 'tool' && p.data?.tool) {
            setState(prev => ({
              ...prev,
              currentTool: { tool: p.data!.tool!, status: 'running', timestamp: Date.now() },
              currentThought: `Using ${p.data!.tool}...`,
              isAgentRunning: true,
            }));
          } else if (p?.stream === 'lifecycle') {
            if (p.data?.phase === 'end' || p.data?.phase === 'error') {
              setState(prev => ({ ...prev, isAgentRunning: false, currentTool: null }));
            }
          } else if (p?.stream === 'assistant' && p.data?.text) {
            responseBufferRef.current = p.data.text;
            setState(prev => ({ ...prev, currentThought: responseBufferRef.current }));
          }
        } else if (evt.event === 'message') {
          const p = evt.payload as { content?: string; text?: string; delta?: string; message?: string } | undefined;
          if (p?.delta) responseBufferRef.current += p.delta;
          else {
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
    } catch { /* ignore parse errors */ }
  }, []);

  const connectOpenClaw = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = openclawUrlRef.current || `ws://${GATEWAY.DEFAULT_HOST}:${GATEWAY.DEFAULT_PORT}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      wsReconnectAttemptsRef.current = 0;
      setTimeout(async () => {
        try {
          await sendWsRequest('connect', {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'webchat-ui', displayName: 'Doraemon', version: '1.0.0', platform: 'electron', mode: 'webchat' },
            role: 'operator', scopes: ['operator.admin'], caps: ['chat.events', 'run.events'],
            auth: { token: GATEWAY.DEFAULT_TOKEN },
          });
          wsConnectedRef.current = true;
          console.log('[useChat] OpenClaw connected (tool routing ready)');
        } catch (e) {
          console.warn('[useChat] OpenClaw connect handshake failed:', e);
          wsConnectedRef.current = false;
        }
      }, 800);
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = () => {
      wsConnectedRef.current = false;
      wsRef.current = null;
      pendingRef.current.forEach(p => p.reject(new Error('Disconnected')));
      pendingRef.current.clear();

      wsReconnectAttemptsRef.current++;
      if (wsReconnectAttemptsRef.current <= GATEWAY.MAX_RECONNECT_ATTEMPTS) {
        wsReconnectTimerRef.current = setTimeout(connectOpenClaw, GATEWAY.RECONNECT_DELAY);
      } else {
        console.log('[useChat] OpenClaw max reconnect attempts reached, tool routing disabled');
      }
    };

    ws.onerror = () => {
      wsConnectedRef.current = false;
    };
  }, [sendWsRequest, handleWsMessage]);

  // Fetch OpenClaw URL from main process config, then connect
  useEffect(() => {
    const init = async () => {
      try {
        const doraemonApi = (window as any).doraemon;
        if (doraemonApi?.getConfig) {
          const config = await doraemonApi.getConfig();
          if (config?.openclawUrl) {
            openclawUrlRef.current = config.openclawUrl;
          }
          if (config?.debugConversation) {
            debugConversationRef.current = true;
          }
        }
      } catch {}
      connectOpenClaw();
    };
    init();
    return () => {
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectOpenClaw]);

  // ── Send via OpenClaw with skill filter ──

  const sendViaOpenClaw = useCallback(async (
    messageWithContext: string,
    skillFilter?: string[]
  ): Promise<string | null> => {
    responseBufferRef.current = '';
    const runId = generateId();
    currentRunIdRef.current = runId;

    try {
      const eventPromise = new Promise<string>((resolve) => {
        let checkCount = 0;

        const checkInterval = setInterval(() => {
          checkCount++;
          if (responseBufferRef.current && responseBufferRef.current.length > 10) {
            clearInterval(checkInterval);
            resolve(responseBufferRef.current);
            return;
          }
          if (checkCount >= OPENCLAW_RESPONSE_TIMEOUT) {
            clearInterval(checkInterval);
            resolve(responseBufferRef.current || '');
          }
        }, 1000);

        pendingRef.current.set(runId, {
          resolve: (v) => {
            clearInterval(checkInterval);
            resolve((v as { content?: string }).content || responseBufferRef.current || '');
          },
          reject: () => {
            clearInterval(checkInterval);
            resolve(responseBufferRef.current || '');
          },
        });
      });

      await sendWsRequest('chat.send', {
        sessionKey: 'main',
        message: messageWithContext,
        deliver: true,
        idempotencyKey: runId,
        ...(skillFilter?.length ? { skillFilter } : {}),
      });

      const content = await eventPromise;
      return content || null;
    } catch (e) {
      console.warn('[useChat] OpenClaw send failed, will fall back to proxy:', e);
      pendingRef.current.delete(runId);
      return null;
    } finally {
      currentRunIdRef.current = null;
    }
  }, [sendWsRequest]);

  // ── Send via CF Worker proxy ──

  const sendViaProxy = useCallback(async (
    messageWithContext: string,
    userMessage: Message
  ): Promise<string | null> => {
    const history = messagesRef.current
      .slice(-MAX_HISTORY)
      .map(m => ({
        role: m.role,
        content: m === userMessage ? messageWithContext : m.content,
      }));

    const result = await callProxy(history, getDeviceId());

    if ('error' in result) {
      return result.error.includes('Rate limit')
        ? "Mou~ I've used up my energy for today. Let's chat again tomorrow~ 💤"
        : `Mou~ Something went wrong: ${result.error}`;
    }

    return result.content;
  }, []);

  // ── Send outbound message via gateway `send` method ──

  const sendOutbound = useCallback(async (
    to: string,
    message: string,
    channel: string = 'whatsapp',
    accountId?: string
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> => {
    if (!wsConnectedRef.current) {
      return { ok: false, error: 'OpenClaw not connected' };
    }

    try {
      const result = await sendWsRequest<{
        runId: string;
        messageId: string;
        channel: string;
        toJid?: string;
      }>('send', {
        to,
        message,
        channel,
        ...(accountId ? { accountId } : {}),
        idempotencyKey: generateId(),
      });

      console.log('[useChat] Outbound sent:', result);
      if (debugConversationRef.current) {
        logToConversationDb({ direction: 'outbound', from: 'doraemon', to, channel, body: message });
      }
      return { ok: true, messageId: result?.messageId };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.warn('[useChat] Outbound send failed:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  }, [sendWsRequest]);

  // ── Main sendMessage with hybrid routing ──

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

    emotionStore.actions.setEmotion('contemplation', 'user');
    animationStore.actions.trigger('action_chat_question', 7000);

    // Inject memory context
    let messageWithContext = text;
    try {
      const memoryContext = await getMemoryContext(text);
      if (memoryContext) {
        messageWithContext = `${memoryContext}\n\nUser message: ${text}`;
      }
    } catch {}

    // Route based on intent
    const decision = routeMessage(text);
    const useOpenClaw = decision.route === 'openclaw' && wsConnectedRef.current;
    const isDirectSend = decision.intent.intent === 'messaging' && wsConnectedRef.current;

    if (isDirectSend) {
      // Parse outbound message: extract target and body from natural language
      const parsed = parseOutboundMessage(text);
      if (parsed) {
        emotionStore.actions.setEmotionProtected('connection', 'ai');
        animationStore.actions.trigger('action_gadget_use', 7000);
        setState(prev => ({
          ...prev,
          currentThought: `Sending message to ${parsed.to} on ${parsed.channel}~`,
        }));

        const result = await sendOutbound(parsed.to, parsed.body, parsed.channel);

        const responseText = result.ok
          ? `Message sent to ${parsed.to} on ${parsed.channel}~ ✉️`
          : `Mou~ Couldn't send: ${result.error || 'unknown error'}`;

        const assistantMessage: Message = { role: 'assistant', content: responseText, timestamp: Date.now() };
        messagesRef.current = [...messagesRef.current, assistantMessage];

        setState(prev => ({
          ...prev,
          messages: messagesRef.current,
          isThinking: false,
          currentThought: responseText,
          error: result.ok ? null : (result.error || null),
          currentTool: null,
          isAgentRunning: false,
        }));

        emotionStore.actions.setEmotionProtected(result.ok ? 'satisfaction' : 'frustration', 'ai');
        animationStore.actions.trigger(result.ok ? 'action_chat_answer' : 'emotion_frustration', 8000);
        setBubbleTimeout();
        return responseText;
      }
    }

    if (useOpenClaw) {
      emotionStore.actions.setEmotionProtected(decision.fallbackEmotion, 'ai');
      animationStore.actions.trigger(
        decision.intent.intent === 'web_search' ? 'action_research' : 'action_gadget_search',
        8000
      );
      setState(prev => ({
        ...prev,
        currentThought: `Let me check my 4D pocket~ (${decision.intent.intent.replace('_', ' ')})`,
      }));
    }

    try {
      let content: string | null = null;

      if (useOpenClaw) {
        content = await sendViaOpenClaw(messageWithContext, decision.skillFilter);

        // Fallback to proxy if OpenClaw returned nothing
        if (!content) {
          console.log('[useChat] OpenClaw returned empty, falling back to proxy');
          content = await sendViaProxy(messageWithContext, userMessage);
        }
      } else {
        // General chat or OpenClaw offline → proxy
        if (decision.route === 'openclaw' && !wsConnectedRef.current) {
          console.log('[useChat] OpenClaw offline, falling back to proxy for:', decision.intent.intent);
        }
        content = await sendViaProxy(messageWithContext, userMessage);
      }

      if (!content) {
        throw new Error('No response from any backend');
      }

      const isProxyError = content.startsWith('Mou~');
      const assistantMessage: Message = { role: 'assistant', content, timestamp: Date.now() };
      messagesRef.current = [...messagesRef.current, assistantMessage];

      setState(prev => ({
        ...prev,
        messages: messagesRef.current,
        isThinking: false,
        currentThought: extractThought(content!),
        error: isProxyError ? content : null,
        currentTool: null,
        isAgentRunning: false,
      }));

      const emotion = isProxyError
        ? 'frustration' as EmotionType
        : detectEmotion(content);
      emotionStore.actions.setEmotionProtected(emotion, 'ai');
      animationStore.actions.trigger(isProxyError ? 'emotion_frustration' : 'action_chat_answer', 9000);
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
        currentTool: null,
        isAgentRunning: false,
      }));

      emotionStore.actions.setEmotionProtected('confusion', 'ai');
      animationStore.actions.trigger('emotion_confusion', 8000);
      setBubbleTimeout();
      return null;
    }
  }, [clearBubbleTimeout, setBubbleTimeout, sendViaOpenClaw, sendViaProxy, sendOutbound]);

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
    sendOutbound,
    triggerEmotion,
    clearHistory,
    getModelMode,
    setAgentMode,
    toggleAgentMode,
  };
};
