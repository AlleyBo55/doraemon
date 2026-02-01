import { signal, computed } from '@preact/signals';

export type AppView = 'mascot' | 'chat' | 'settings';

const view = signal<AppView>('mascot');
const isMinimized = signal(false);
const lastInteraction = signal(Date.now());

export const state = {
  view: computed(() => view.value),
  isMinimized: computed(() => isMinimized.value),
  lastInteraction: computed(() => lastInteraction.value),
  idleTime: computed(() => Date.now() - lastInteraction.value),
};

export const actions = {
  setView: (v: AppView) => {
    view.value = v;
  },

  minimize: () => {
    isMinimized.value = true;
  },

  restore: () => {
    isMinimized.value = false;
  },

  recordInteraction: () => {
    lastInteraction.value = Date.now();
  },
};
