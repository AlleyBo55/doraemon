export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number }
  | { status: 'error'; error: Error };

export const isConnected = (s: ConnectionState): boolean =>
  s.status === 'connected';

export const isReconnecting = (s: ConnectionState): boolean =>
  s.status === 'reconnecting';
