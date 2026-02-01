export const GATEWAY = {
  DEFAULT_HOST: 'localhost',
  DEFAULT_PORT: 3000,
  RECONNECT_DELAY: 2000,
  MAX_RECONNECT_ATTEMPTS: 5,
  HEARTBEAT_INTERVAL: 30_000,
  CONNECTION_TIMEOUT: 10_000,
} as const;

export const ENDPOINTS = {
  HEALTH: '/health',
  CHAT: '/chat',
  EMOTION: '/emotion',
  STATUS: '/status',
} as const;

export type GatewayEndpoint = typeof ENDPOINTS[keyof typeof ENDPOINTS];
