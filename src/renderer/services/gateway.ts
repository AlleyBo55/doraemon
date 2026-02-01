import { GATEWAY } from '../core/constants/gateway';
import type { Port } from '../core/types/brand';
import { Ok, Err, type Result } from '../core/utils/result';

export type GatewayMessage = {
  type: 'chat' | 'emotion' | 'status' | 'error';
  payload: unknown;
  timestamp: number;
};

export type GatewayConfig = {
  host: string;
  port: Port;
  onMessage: (msg: GatewayMessage) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
};

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const buildUrl = (host: string, port: Port): string =>
  `ws://${host}:${port}`;

export const connect = (config: GatewayConfig): Result<void, Error> => {
  if (socket?.readyState === WebSocket.OPEN) {
    return Ok(undefined);
  }

  try {
    const url = buildUrl(config.host, config.port);
    socket = new WebSocket(url);

    socket.onopen = () => {
      reconnectAttempts = 0;
      config.onConnect();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as GatewayMessage;
        config.onMessage(msg);
      } catch {
        config.onError(new Error('Invalid message format'));
      }
    };

    socket.onclose = () => {
      config.onDisconnect();
      scheduleReconnect(config);
    };

    socket.onerror = () => {
      config.onError(new Error('WebSocket error'));
    };

    return Ok(undefined);
  } catch (e) {
    return Err(e instanceof Error ? e : new Error('Connection failed'));
  }
};

const scheduleReconnect = (config: GatewayConfig): void => {
  if (reconnectAttempts >= GATEWAY.MAX_RECONNECT_ATTEMPTS) return;

  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    connect(config);
  }, GATEWAY.RECONNECT_DELAY);
};

export const disconnect = (): void => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
  reconnectAttempts = 0;
};

export const send = (message: GatewayMessage): Result<void, Error> => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Err(new Error('Not connected'));
  }

  try {
    socket.send(JSON.stringify(message));
    return Ok(undefined);
  } catch (e) {
    return Err(e instanceof Error ? e : new Error('Send failed'));
  }
};

export const isConnected = (): boolean =>
  socket?.readyState === WebSocket.OPEN;