import { signal, computed } from '@preact/signals';

export type MascotAnimationRequest = {
  id: number;
  name: string;
  duration: number;
};

const current = signal<MascotAnimationRequest | null>(null);
let nextId = 0;

export const state = {
  current: computed(() => current.value),
};

export const actions = {
  trigger: (name: string, duration = 8000) => {
    current.value = {
      id: ++nextId,
      name,
      duration,
    };
  },
  clear: () => {
    current.value = null;
  },
};
