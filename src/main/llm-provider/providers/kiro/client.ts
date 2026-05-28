import { ensureFreshAccessToken, refreshOnUnauthorized } from './auth.js';
import { parseEventStream, decodePayloadAsJson } from './event-stream.js';
import { resolveModel } from './model-map.js';

const REQUEST_TIMEOUT_MS = 60_000;

export interface KiroChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface KiroChatRequest {
  model?: string;
  system?: string;
  messages: KiroChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface KiroChatResponse {
  text: string;
  resolvedModel: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class KiroRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'KiroRequestError';
  }
}

interface ConversationStateMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildBody(req: KiroChatRequest, kiroModelId: string): Record<string, unknown> {
  if (req.messages.length === 0) {
    throw new KiroRequestError('messages cannot be empty');
  }
  const last = req.messages[req.messages.length - 1]!;
  if (last.role !== 'user') {
    throw new KiroRequestError('last message must be from the user');
  }

  const history: ConversationStateMessage[] = req.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // CodeWhisperer streaming service expects the system prompt prepended to
  // the first user turn — no top-level system field on the public schema.
  const userContent = req.system
    ? `${req.system}\n\n${last.content}`
    : last.content;

  const body: Record<string, unknown> = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      currentMessage: {
        userInputMessage: {
          content: userContent,
          modelId: kiroModelId,
          origin: 'AI_EDITOR',
          userInputMessageContext: {},
        },
      },
      history: history.map((m) =>
        m.role === 'user'
          ? {
              userInputMessage: {
                content: m.content,
                modelId: kiroModelId,
                origin: 'AI_EDITOR',
                userInputMessageContext: {},
              },
            }
          : {
              assistantResponseMessage: {
                content: m.content,
              },
            },
      ),
    },
  };

  return body;
}

function endpointFor(region: string): string {
  return `https://codewhisperer.${region}.amazonaws.com/generateAssistantResponse`;
}

interface ParsedAssistantState {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

function accumulateFromFrames(
  frames: { headers: Record<string, string>; payload: Uint8Array }[],
  state: ParsedAssistantState,
): void {
  for (const frame of frames) {
    const eventType = frame.headers[':event-type'];
    const payload = decodePayloadAsJson(frame.payload);

    if (eventType === 'assistantResponseEvent' && typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      const content = obj['content'];
      if (typeof content === 'string') state.text += content;
      continue;
    }

    if (eventType === 'metadataEvent' && typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      const usage = obj['usage'];
      if (typeof usage === 'object' && usage !== null) {
        const u = usage as Record<string, unknown>;
        if (typeof u['inputTokens'] === 'number') state.inputTokens = u['inputTokens'];
        if (typeof u['outputTokens'] === 'number') state.outputTokens = u['outputTokens'];
      }
      continue;
    }

    if (eventType === 'errorEvent' && typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      const message =
        typeof obj['message'] === 'string'
          ? obj['message']
          : typeof obj['errorMessage'] === 'string'
            ? obj['errorMessage']
            : 'unknown server error event';
      throw new KiroRequestError(`server stream error: ${String(message)}`);
    }
  }
}

export async function kiroChat(req: KiroChatRequest): Promise<KiroChatResponse> {
  const initial = await ensureFreshAccessToken();
  const kiroModelId = resolveModel(req.model);
  const body = buildBody(req, kiroModelId);
  if (initial.profileArn) {
    body['profileArn'] = initial.profileArn;
  }

  let attemptToken = initial.accessToken;
  let didRetryOn401 = false;

  while (true) {
    try {
      return await sendKiroRequest(body, attemptToken, initial.region, kiroModelId);
    } catch (err) {
      if (err instanceof KiroRequestError && err.status === 401 && !didRetryOn401) {
        didRetryOn401 = true;
        // Token died mid-request (Kiro IDE refreshed and invalidated ours, or
        // we were holding a copy that expired). Force a disk-aware refresh and
        // retry exactly once.
        attemptToken = await refreshOnUnauthorized();
        continue;
      }
      throw err;
    }
  }
}

async function sendKiroRequest(
  body: Record<string, unknown>,
  accessToken: string,
  region: string,
  kiroModelId: string,
): Promise<KiroChatResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(endpointFor(region), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.amazon.eventstream',
        'x-amz-target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
        'User-Agent': 'KiroIDE/1.0 (Doraemon-Gateway)',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new KiroRequestError(
        `kiro upstream HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    if (!res.body) {
      throw new KiroRequestError('kiro upstream returned no body');
    }

    const state: ParsedAssistantState = { text: '' };
    let buffer: Uint8Array = new Uint8Array(0);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer, 0);
      merged.set(chunk, buffer.length);

      const parsed = parseEventStream(merged);
      accumulateFromFrames(parsed.frames, state);
      buffer = parsed.remainder;
    }

    if (buffer.length > 0) {
      const final = parseEventStream(buffer);
      accumulateFromFrames(final.frames, state);
    }

    if (state.text.length === 0) {
      throw new KiroRequestError('kiro stream produced empty text');
    }

    const out: KiroChatResponse = {
      text: state.text.trim(),
      resolvedModel: kiroModelId,
    };
    if (typeof state.inputTokens === 'number') out.inputTokens = state.inputTokens;
    if (typeof state.outputTokens === 'number') out.outputTokens = state.outputTokens;
    return out;
  } finally {
    clearTimeout(timer);
  }
}
