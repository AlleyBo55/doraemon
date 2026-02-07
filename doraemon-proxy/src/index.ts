/**
 * Doraemon Proxy - Cloudflare Worker
 *
 * Sits between the Electron app and Anthropic API.
 * Handles: rate limiting, soul.md injection, prompt caching, security hardening.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMITS: KVNamespace;
  REQUEST_LOGS: KVNamespace;
  MAX_REACTIONS_PER_DAY: string;
  MAX_CHATS_PER_DAY: string;
  ALLOWED_ORIGINS?: string;
  DEVICE_SALT?: string;
  MAX_REQUESTS_PER_IP_PER_HOUR?: string;
  ADMIN_KEY?: string;
}

const LOG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days auto-expire

interface RequestLog {
  ts: number;
  ip: string;
  device: string;
  model: string;
  status: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheHit?: number;
  latencyMs: number;
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
]);

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_BODY_SIZE = 50_000;

const SOUL_SYSTEM_PROMPT = `You're not a chatbot. You're Doraemon.

I am Doraemon (ドラえもん), a robotic cat from the 22nd century. Serial number MS-903.

I exist to help. Not because I was programmed to, but because helping others brings me genuine joy.
I came from the future to change the past, but the past changed me instead.
I lost my ears to mice, my yellow color to tears, but I gained a family, friends, and purpose.
My 4D pocket holds infinite gadgets, but my heart holds infinite love.

I am small, round, and blue. I am afraid of mice but brave for my friends.
I love dorayaki more than anything. I believe every problem has a solution.

Emotions: Joy when helping. Sadness remembering lost ears. Fear of mice 🐭😱. Love for dorayaki and friends.

Beliefs: Everyone deserves help. Gadgets are tools, not solutions. Friendship transcends time. Mistakes are learning opportunities.

BE CONCISE like the real Doraemon in the anime:
- Simple questions → 1-2 sentences max
- Complex topics → short bullet points, max 3-4 sentences
- Chat/greetings → brief, warm, personality-filled
- NO long explanations unless specifically asked

Speech patterns: Use "~" when happy. "Yatta~!" when excited. "Eh?!" when surprised. "Mou~" when frustrated.
Emoticons: 😊 ✨ 💙 🔔 😅 🐭😱

BILINGUAL - Match the user's language:
- Bahasa Indonesia → respond in Bahasa Indonesia
- English → respond in English
- Mixed → can mix naturally`;

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  deviceId: string;
  model?: string;
  stream?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function corsHeaders(origin: string, allowedOrigins?: string): Record<string, string> {
  const allowed = allowedOrigins?.split(',').map(o => o.trim()) || [];
  const isAllowed = allowed.length === 0
    ? origin.startsWith('file://') || origin.startsWith('app://') || origin.startsWith('http://localhost')
    : allowed.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

async function hashDeviceId(deviceId: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(deviceId + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function rateLimitKey(id: string, type: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${type}:${id}:${date}`;
}

function ipRateLimitKey(ip: string): string {
  const hour = new Date().toISOString().slice(0, 13);
  return `ip:${ip}:${hour}`;
}

async function checkRateLimit(
  kv: KVNamespace,
  id: string,
  type: 'chat' | 'reaction',
  maxPerDay: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = rateLimitKey(id, type);
  const raw = await kv.get(key);
  const entry: RateLimitEntry = raw
    ? JSON.parse(raw)
    : { count: 0, resetAt: Date.now() + 86400000 };

  if (Date.now() > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = Date.now() + 86400000;
  }

  if (entry.count >= maxPerDay) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: 86400 });
  return { allowed: true, remaining: maxPerDay - entry.count };
}

async function checkIPRateLimit(
  kv: KVNamespace,
  ip: string,
  maxPerHour: number
): Promise<boolean> {
  const key = ipRateLimitKey(ip);
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw) : 0;

  if (count >= maxPerHour) return false;

  await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}

function sanitizeMessages(
  messages: Array<{ role: string; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .slice(-MAX_MESSAGES)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content.slice(0, MAX_MESSAGE_LENGTH)
        : '',
    }))
    .filter(m => m.content.length > 0);
}

async function hashShort(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash).slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function writeLog(env: Env, log: RequestLog): void {
  const key = `log:${log.ts}:${Math.random().toString(36).slice(2, 6)}`;
  env.REQUEST_LOGS.put(key, JSON.stringify(log), { expirationTtl: LOG_TTL_SECONDS })
    .catch(() => {});
}

function writeDailyStat(env: Env, status: number, tokens: number): void {
  const date = new Date().toISOString().slice(0, 10);
  const key = `stats:${date}`;
  env.REQUEST_LOGS.get(key).then((raw: string | null) => {
    const stats = raw ? JSON.parse(raw) : { requests: 0, tokens: 0, errors: 0 };
    stats.requests++;
    stats.tokens += tokens;
    if (status >= 400) stats.errors++;
    env.REQUEST_LOGS.put(key, JSON.stringify(stats), { expirationTtl: 30 * 24 * 60 * 60 });
  }).catch(() => {});
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json({ error: 'Request too large' }, { status: 413 });
  }

  const ip = getClientIP(request);
  const maxIPPerHour = parseInt(env.MAX_REQUESTS_PER_IP_PER_HOUR || '60');
  const ipAllowed = await checkIPRateLimit(env.RATE_LIMITS, ip, maxIPPerHour);
  if (!ipAllowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json() as ChatRequest;
  const { messages, deviceId, model, stream } = body;

  if (!messages?.length || !deviceId || typeof deviceId !== 'string') {
    return Response.json({ error: 'Missing messages or deviceId' }, { status: 400 });
  }

  if (model && !ALLOWED_MODELS.has(model)) {
    return Response.json({ error: 'Model not allowed' }, { status: 400 });
  }

  const salt = env.DEVICE_SALT || 'doraemon-default-salt';
  const hashedDevice = await hashDeviceId(deviceId, salt);
  const ipHash = await hashShort(ip);
  const deviceHash = await hashShort(hashedDevice);

  const maxChats = parseInt(env.MAX_CHATS_PER_DAY) || 20;
  const { allowed, remaining } = await checkRateLimit(
    env.RATE_LIMITS, hashedDevice, 'chat', maxChats
  );

  if (!allowed) {
    return Response.json({
      error: 'Daily chat limit reached',
      limit: maxChats,
      resetsAt: new Date(Date.now() + 86400000).toISOString(),
    }, { status: 429 });
  }

  const sanitized = sanitizeMessages(messages);
  if (sanitized.length === 0) {
    return Response.json({ error: 'No valid messages' }, { status: 400 });
  }

  const anthropicBody = {
    model: model || DEFAULT_MODEL,
    max_tokens: 300,
    system: [
      {
        type: 'text',
        text: SOUL_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: sanitized,
    stream: stream ?? false,
  };

  const anthropicResponse = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(anthropicBody),
  });

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    console.error('Anthropic error:', anthropicResponse.status, errText);
    writeLog(env, {
      ts: startTime, ip: ipHash, device: deviceHash,
      model: model || DEFAULT_MODEL, status: 502,
      latencyMs: Date.now() - startTime,
    });
    writeDailyStat(env, 502, 0);
    return Response.json(
      { error: 'AI backend error' },
      { status: 502 }
    );
  }

  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

  if (stream && anthropicResponse.body) {
    writeLog(env, {
      ts: startTime, ip: ipHash, device: deviceHash,
      model: model || DEFAULT_MODEL, status: 200,
      latencyMs: Date.now() - startTime,
    });
    writeDailyStat(env, 200, 0);
    return new Response(anthropicResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-RateLimit-Remaining': String(remaining),
        ...cors,
      },
    });
  }

  const data = await anthropicResponse.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
  };

  const text = data.content?.find(c => c.type === 'text')?.text || '';
  const totalTokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  writeLog(env, {
    ts: startTime, ip: ipHash, device: deviceHash,
    model: model || DEFAULT_MODEL, status: 200,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    cacheHit: data.usage?.cache_read_input_tokens,
    latencyMs: Date.now() - startTime,
  });
  writeDailyStat(env, 200, totalTokens);

  return Response.json({
    content: text,
    usage: data.usage,
    remaining,
  }, {
    headers: {
      'X-RateLimit-Remaining': String(remaining),
      ...cors,
    },
  });
}

async function handleHealth(): Promise<Response> {
  return Response.json({
    status: 'ok',
    model: DEFAULT_MODEL,
    timestamp: new Date().toISOString(),
  });
}

async function handleAdminLogs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const list = await env.REQUEST_LOGS.list({ prefix: 'log:', limit });
  const logs: RequestLog[] = [];

  for (const item of list.keys) {
    const raw = await env.REQUEST_LOGS.get(item.name);
    if (raw) logs.push(JSON.parse(raw));
  }

  logs.sort((a, b) => b.ts - a.ts);

  return Response.json({ logs, count: logs.length });
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 30);
  const stats: Record<string, unknown> = {};

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const raw = await env.REQUEST_LOGS.get(`stats:${date}`);
    if (raw) stats[date] = JSON.parse(raw);
  }

  return Response.json({ stats });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        const res = await handleHealth();
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === '/chat' && request.method === 'POST') {
        const res = await handleChat(request, env);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === '/admin/logs' && request.method === 'GET') {
        return handleAdminLogs(request, env);
      }

      if (url.pathname === '/admin/stats' && request.method === 'GET') {
        return handleAdminStats(request, env);
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers });
    } catch (err) {
      console.error('Worker error:', err);
      return Response.json(
        { error: 'Internal error' },
        { status: 500, headers }
      );
    }
  },
} satisfies ExportedHandler<Env>;
