import http from 'node:http';
import { kiroChat, KiroRequestError } from './providers/kiro/client.js';
import { KiroAuthExpired, KiroAuthMissing, KiroAuthNetwork } from './providers/kiro/auth.js';
import { listKnownModels, resolveModel } from './providers/kiro/model-map.js';
import { logLLMCall } from './logger.js';

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type?: string; text?: string }>;
}

interface AnthropicMessagesRequest {
  model?: string;
  max_tokens?: number;
  system?: string | Array<{ type?: string; text?: string }>;
  temperature?: number;
  messages: AnthropicMessage[];
  stream?: boolean;
}

interface OpenAIChatRequest {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}

let server: http.Server | null = null;
let activeToken: string | null = null;
let activePort = 0;

export interface GatewayInfo {
  port: number;
  running: boolean;
}

export function getGatewayInfo(): GatewayInfo {
  return { port: activePort, running: server !== null };
}

function flattenAnthropicContent(content: AnthropicMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (typeof block?.text === 'string' ? block.text : ''))
    .filter((s) => s.length > 0)
    .join('\n');
}

function flattenSystem(sys: AnthropicMessagesRequest['system']): string | undefined {
  if (typeof sys === 'string') return sys;
  if (Array.isArray(sys)) {
    const joined = sys
      .map((block) => (typeof block?.text === 'string' ? block.text : ''))
      .filter((s) => s.length > 0)
      .join('\n');
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function checkAuth(req: http.IncomingMessage): { ok: true } | { ok: false; reason: string } {
  if (!activeToken) return { ok: false, reason: 'gateway not initialized' };

  const apiKey = req.headers['x-api-key'];
  const auth = req.headers['authorization'];

  if (typeof apiKey === 'string' && apiKey === activeToken) return { ok: true };

  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1] === activeToken) return { ok: true };
  }

  return { ok: false, reason: 'invalid or missing token' };
}

function jsonReply(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sseEvent(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function startSseResponse(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

async function streamAnthropicMessagesAsBuffered(
  res: http.ServerResponse,
  flatMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string | undefined,
  requestedModel: string,
  maxTokens: number | undefined,
  temperature: number | undefined,
  startedAt: number,
  routePath: string,
): Promise<void> {
  // We collect the full reply with kiroChat then replay it as a single
  // content_block_delta. Good enough to satisfy clients that expect a stream
  // (e.g. pi-ai's anthropic provider) without holding open a true SSE pipe.
  startSseResponse(res);

  const messageId = `msg_${Date.now().toString(36)}`;

  const safeWrite = (event: string, data: unknown) => {
    try {
      sseEvent(res, event, data);
    } catch {
      // client closed
    }
  };

  safeWrite('message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: requestedModel,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
  safeWrite('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  });

  // Heartbeat ping so the client doesn't time out while we wait on the upstream.
  const ping = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {"type":"ping"}\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 10_000);

  try {
    const result = await kiroChat({
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      messages: flatMessages,
    });
    clearInterval(ping);

    // Chunk the text into small deltas so the SDK shows progress instead of one big blob.
    const text = result.text;
    const CHUNK = 256;
    for (let i = 0; i < text.length; i += CHUNK) {
      safeWrite('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: text.slice(i, i + CHUNK) },
      });
    }

    safeWrite('content_block_stop', { type: 'content_block_stop', index: 0 });
    safeWrite('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: {
        input_tokens: result.inputTokens ?? 0,
        output_tokens: result.outputTokens ?? 0,
      },
    });
    safeWrite('message_stop', { type: 'message_stop' });

    res.end();

    logLLMCall({
      provider: 'kiro',
      model: result.resolvedModel,
      path: `${routePath} (stream)`,
      ...(typeof result.inputTokens === 'number' ? { inputTokens: result.inputTokens } : {}),
      ...(typeof result.outputTokens === 'number' ? { outputTokens: result.outputTokens } : {}),
      durationMs: Date.now() - startedAt,
      ok: true,
    });
  } catch (err) {
    clearInterval(ping);
    const mapped = mapKiroError(err);
    safeWrite('error', {
      type: 'error',
      error: { type: mapped.type, message: mapped.message },
    });
    res.end();

    logLLMCall({
      provider: 'kiro',
      model: requestedModel,
      path: `${routePath} (stream)`,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorMessage: mapped.message,
    });
  }
}

function errorReply(
  res: http.ServerResponse,
  status: number,
  type: string,
  message: string,
): void {
  jsonReply(res, status, {
    type: 'error',
    error: { type, message },
  });
}

function mapKiroError(err: unknown): { status: number; type: string; message: string } {
  if (err instanceof KiroAuthMissing) {
    return { status: 401, type: 'authentication_error', message: 'Kiro session not found on this machine' };
  }
  if (err instanceof KiroAuthExpired) {
    return { status: 401, type: 'authentication_error', message: err.message };
  }
  if (err instanceof KiroAuthNetwork) {
    return { status: 502, type: 'api_error', message: err.message };
  }
  if (err instanceof KiroRequestError) {
    const status = err.status && err.status >= 400 ? err.status : 502;
    return { status, type: 'api_error', message: err.message };
  }
  return { status: 500, type: 'api_error', message: err instanceof Error ? err.message : 'unknown error' };
}

async function handleAnthropicMessages(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const started = Date.now();
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    errorReply(res, 413, 'invalid_request_error', err instanceof Error ? err.message : 'body too large');
    return;
  }

  let body: AnthropicMessagesRequest;
  try {
    body = JSON.parse(raw) as AnthropicMessagesRequest;
  } catch (err) {
    errorReply(res, 400, 'invalid_request_error', `invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
    return;
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    errorReply(res, 400, 'invalid_request_error', 'messages must be a non-empty array');
    return;
  }

  const flatMessages = body.messages.map((m) => ({
    role: m.role,
    content: flattenAnthropicContent(m.content),
  }));

  const last = flatMessages[flatMessages.length - 1]!;
  if (last.role !== 'user') {
    errorReply(res, 400, 'invalid_request_error', 'last message must have role=user');
    return;
  }

  const systemPrompt = flattenSystem(body.system);
  const requestedModel = body.model ?? 'claude-haiku-4-5';

  if (body.stream === true) {
    await streamAnthropicMessagesAsBuffered(
      res,
      flatMessages,
      systemPrompt,
      requestedModel,
      typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
      typeof body.temperature === 'number' ? body.temperature : undefined,
      started,
      '/v1/messages',
    );
    return;
  }

  try {
    const result = await kiroChat({
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(typeof body.max_tokens === 'number' ? { maxTokens: body.max_tokens } : {}),
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      messages: flatMessages,
    });

    logLLMCall({
      provider: 'kiro',
      model: result.resolvedModel,
      path: '/v1/messages',
      ...(typeof result.inputTokens === 'number' ? { inputTokens: result.inputTokens } : {}),
      ...(typeof result.outputTokens === 'number' ? { outputTokens: result.outputTokens } : {}),
      durationMs: Date.now() - started,
      ok: true,
    });

    jsonReply(res, 200, {
      id: `msg_${Date.now().toString(36)}`,
      type: 'message',
      role: 'assistant',
      model: requestedModel,
      content: [{ type: 'text', text: result.text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: result.inputTokens ?? 0,
        output_tokens: result.outputTokens ?? 0,
      },
    });
  } catch (err) {
    const mapped = mapKiroError(err);
    logLLMCall({
      provider: 'kiro',
      model: requestedModel,
      path: '/v1/messages',
      durationMs: Date.now() - started,
      ok: false,
      errorMessage: mapped.message,
    });
    errorReply(res, mapped.status, mapped.type, mapped.message);
  }
}

async function handleOpenAIChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const started = Date.now();
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    errorReply(res, 413, 'invalid_request_error', err instanceof Error ? err.message : 'body too large');
    return;
  }

  let body: OpenAIChatRequest;
  try {
    body = JSON.parse(raw) as OpenAIChatRequest;
  } catch (err) {
    errorReply(res, 400, 'invalid_request_error', `invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
    return;
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    errorReply(res, 400, 'invalid_request_error', 'messages must be a non-empty array');
    return;
  }

  const systemMessages = body.messages.filter((m) => m.role === 'system');
  const conv = body.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  if (conv.length === 0 || conv[conv.length - 1]!.role !== 'user') {
    errorReply(res, 400, 'invalid_request_error', 'must end with a user message');
    return;
  }

  const systemPrompt =
    systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n')
      : undefined;
  const requestedModel = body.model ?? 'claude-haiku-4-5';

  if (body.stream === true) {
    errorReply(res, 400, 'invalid_request_error', 'streaming not yet supported by gateway');
    return;
  }

  try {
    const result = await kiroChat({
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(typeof body.max_tokens === 'number' ? { maxTokens: body.max_tokens } : {}),
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      messages: conv.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    logLLMCall({
      provider: 'kiro',
      model: result.resolvedModel,
      path: '/v1/chat/completions',
      ...(typeof result.inputTokens === 'number' ? { inputTokens: result.inputTokens } : {}),
      ...(typeof result.outputTokens === 'number' ? { outputTokens: result.outputTokens } : {}),
      durationMs: Date.now() - started,
      ok: true,
    });

    jsonReply(res, 200, {
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.text },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: result.inputTokens ?? 0,
        completion_tokens: result.outputTokens ?? 0,
        total_tokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
      },
    });
  } catch (err) {
    const mapped = mapKiroError(err);
    logLLMCall({
      provider: 'kiro',
      model: requestedModel,
      path: '/v1/chat/completions',
      durationMs: Date.now() - started,
      ok: false,
      errorMessage: mapped.message,
    });
    errorReply(res, mapped.status, mapped.type, mapped.message);
  }
}

function handleListModels(res: http.ServerResponse): void {
  const models = listKnownModels().map((id) => ({
    id,
    object: 'model',
    owned_by: 'kiro',
    created: Math.floor(Date.now() / 1000),
  }));
  jsonReply(res, 200, { object: 'list', data: models });
}

function handleHealth(res: http.ServerResponse): void {
  jsonReply(res, 200, { status: 'ok', provider: 'kiro', port: activePort });
}

function handleResolve(res: http.ServerResponse, url: URL): void {
  const model = url.searchParams.get('model') ?? '';
  jsonReply(res, 200, { input: model, resolved: resolveModel(model) });
}

async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!req.url) {
    errorReply(res, 400, 'invalid_request_error', 'missing url');
    return;
  }
  const url = new URL(req.url, `http://${HOST}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    handleHealth(res);
    return;
  }

  const auth = checkAuth(req);
  if (!auth.ok) {
    console.warn(
      `[kiro-gateway] auth-fail method=${req.method} path=${url.pathname} reason="${auth.reason}"`,
    );
    errorReply(res, 401, 'authentication_error', auth.reason);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    handleListModels(res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/models/resolve') {
    handleResolve(res, url);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/messages') {
    await handleAnthropicMessages(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleOpenAIChat(req, res);
    return;
  }

  errorReply(res, 404, 'not_found_error', `${req.method} ${url.pathname}`);
}

export interface StartGatewayOpts {
  token: string;
  port: number;
}

export async function startKiroGateway(opts: StartGatewayOpts): Promise<GatewayInfo> {
  if (server) {
    if (activeToken === opts.token && activePort === opts.port) {
      return getGatewayInfo();
    }
    await stopKiroGateway();
  }

  if (!opts.token || opts.token.length < 8) {
    throw new Error('startKiroGateway: token must be at least 8 chars');
  }
  if (!Number.isInteger(opts.port) || opts.port <= 0 || opts.port >= 65536) {
    throw new Error(`startKiroGateway: invalid port ${opts.port}`);
  }

  activeToken = opts.token;
  activePort = opts.port;

  return new Promise<GatewayInfo>((resolve, reject) => {
    const s = http.createServer((req, res) => {
      void router(req, res).catch((err) => {
        console.error('[kiro-gateway] unhandled error:', err);
        if (!res.headersSent) {
          errorReply(res, 500, 'api_error', 'internal server error');
        }
      });
    });

    s.on('error', (err) => {
      activeToken = null;
      activePort = 0;
      server = null;
      reject(err);
    });

    s.listen(opts.port, HOST, () => {
      server = s;
      console.log(`[kiro-gateway] listening on http://${HOST}:${opts.port}`);
      resolve(getGatewayInfo());
    });
  });
}

export async function stopKiroGateway(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  activeToken = null;
  activePort = 0;
  await new Promise<void>((resolve) => {
    s.close(() => resolve());
  });
  console.log('[kiro-gateway] stopped');
}
