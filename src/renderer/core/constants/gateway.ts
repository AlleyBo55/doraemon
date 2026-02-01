export const GATEWAY = {
  DEFAULT_HOST: '127.0.0.1',
  DEFAULT_PORT: 18789,
  DEFAULT_TOKEN: 'localdev',
  RECONNECT_DELAY: 2000,
  MAX_RECONNECT_ATTEMPTS: 5,
  HEARTBEAT_INTERVAL: 30_000,
  CONNECTION_TIMEOUT: 10_000,
} as const;

export const getDashboardUrl = (token = GATEWAY.DEFAULT_TOKEN) =>
  `http://${GATEWAY.DEFAULT_HOST}:${GATEWAY.DEFAULT_PORT}/?token=${token}`;

export const ENDPOINTS = {
  HEALTH: '/health',
  CHAT: '/chat',
  EMOTION: '/emotion',
  STATUS: '/status',
} as const;

export type GatewayEndpoint = typeof ENDPOINTS[keyof typeof ENDPOINTS];
