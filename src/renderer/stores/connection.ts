import { signal, computed } from '@preact/signals';
import type { ConnectionState } from '../core/types/connection';
import type { Port } from '../core/types/brand';
import { GATEWAY } from '../core/constants/gateway';
import { asPort } from '../core/types/brand';

const connectionState = signal<ConnectionState>({ status: 'disconnected' });
const port = signal<Port>(asPort(GATEWAY.DEFAULT_PORT));
const host = signal(GATEWAY.DEFAULT_HOST);

export const state = {
  connection: computed(() => connectionState.value),
  status: computed(() => connectionState.value.status),
  isConnected: computed(() => connectionState.value.status === 'connected'),
  isConnecting: computed(() => connectionState.value.status === 'connecting'),
  port: computed(() => port.value),
  host: computed(() => host.value),
  error: computed(() =>
    connectionState.value.status === 'error'
      ? connectionState.value.error
      : null
  ),
};

export const actions = {
  setConnecting: () => {
    connectionState.value = { status: 'connecting' };
  },

  setConnected: () => {
    connectionState.value = { status: 'connected' };
  },

  setDisconnected: () => {
    connectionState.value = { status: 'disconnected' };
  },

  setError: (error: Error) => {
    connectionState.value = { status: 'error', error };
  },

  setPort: (p: Port) => {
    port.value = p;
  },

  setHost: (h: string) => {
    host.value = h;
  },
};
