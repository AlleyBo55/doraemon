import { useState, useEffect, useCallback } from 'preact/hooks';
import * as spriteLoader from '../services/sprite-loader';
import type { SpriteState } from '../core/constants/sprite';

type SpriteStatus = 'idle' | 'loading' | 'ready' | 'error';

export const useSprites = (basePath: string) => {
  const [status, setStatus] = useState<SpriteStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (state: SpriteState) => {
      setStatus('loading');
      const result = await spriteLoader.loadSprite(state, basePath);

      if (result.ok) {
        setStatus('ready');
        return result.value;
      } else {
        setStatus('error');
        setError(result.error);
        return null;
      }
    },
    [basePath]
  );

  const preload = useCallback(
    async (states: SpriteState[]) => {
      setStatus('loading');
      await spriteLoader.preloadSprites(states, basePath);
      setStatus('ready');
    },
    [basePath]
  );

  useEffect(() => {
    return () => {
      spriteLoader.clearCache();
    };
  }, []);

  return {
    status,
    error,
    isLoading: status === 'loading',
    isReady: status === 'ready',
    load,
    preload,
  };
};
