import { useEffect, useRef } from 'preact/hooks';
import { appStore, emotionStore } from '../stores';

const IDLE_CHECK_INTERVAL = 10_000;

export const useIdleDetection = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleActivity = () => {
      appStore.actions.recordInteraction();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    intervalRef.current = setInterval(() => {
      const idleTime = appStore.state.idleTime.value;
      emotionStore.actions.updateFromIdle(idleTime);
    }, IDLE_CHECK_INTERVAL);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
};
