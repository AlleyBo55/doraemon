import { useEffect, useCallback } from 'preact/hooks';
import * as gateway from '../services/gateway';
import { connectionStore } from '../stores';
import { emotionStore } from '../stores';
import type { EmotionType } from '../core/types/emotion';

export const useGateway = () => {
  const { isConnected, isConnecting, error, host, port } = connectionStore.state;

  const connect = useCallback(() => {
    connectionStore.actions.setConnecting();

    gateway.connect({
      host: host.value,
      port: port.value,
      onConnect: () => connectionStore.actions.setConnected(),
      onDisconnect: () => connectionStore.actions.setDisconnected(),
      onError: (err) => connectionStore.actions.setError(err),
      onMessage: (msg) => {
        if (msg.type === 'emotion') {
          emotionStore.actions.setEmotion(
            msg.payload as EmotionType,
            'ai'
          );
        }
      },
    });
  }, []);

  const disconnect = useCallback(() => {
    gateway.disconnect();
    connectionStore.actions.setDisconnected();
  }, []);

  const sendChat = useCallback((text: string) => {
    gateway.send({
      type: 'chat',
      payload: { text },
      timestamp: Date.now(),
    });
  }, []);

  useEffect(() => {
    return () => {
      gateway.disconnect();
    };
  }, []);

  return {
    isConnected: isConnected.value,
    isConnecting: isConnecting.value,
    error: error.value,
    connect,
    disconnect,
    sendChat,
  };
};
