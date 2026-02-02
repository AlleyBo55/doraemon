import { signal, computed, effect } from '@preact/signals';

export type ModelMode = 'single' | 'multi';

export interface DoraemonConfig {
  modelMode: ModelMode;
  singleModel: string;
  thoughtInterval: number;
  thoughtCycleCount: number;
  thoughtCooldownCycles: number;
}

const DEFAULT_CONFIG: DoraemonConfig = {
  modelMode: 'single',
  singleModel: 'anthropic/claude-haiku-4-5-20251001',
  thoughtInterval: 7000,
  thoughtCycleCount: 10,
  thoughtCooldownCycles: 3,
};

const config = signal<DoraemonConfig>(loadConfig());

function loadConfig(): DoraemonConfig {
  try {
    const stored = localStorage.getItem('doraemon-config');
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(cfg: DoraemonConfig): void {
  try {
    localStorage.setItem('doraemon-config', JSON.stringify(cfg));
  } catch {}
}

// Sync model mode to main process when it changes
effect(() => {
  const mode = config.value.modelMode;
  if (typeof window !== 'undefined' && (window as any).electronAPI?.syncModelMode) {
    (window as any).electronAPI.syncModelMode(mode);
  }
});

// Listen for model mode changes from tray menu
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if ((window as any).electronAPI?.onModelModeChanged) {
      (window as any).electronAPI.onModelModeChanged((mode: ModelMode) => {
        config.value = { ...config.value, modelMode: mode };
        saveConfig(config.value);
      });
    }
  }, 100);
}

export const configState = {
  config: computed(() => config.value),
  modelMode: computed(() => config.value.modelMode),
  isMultiModel: computed(() => config.value.modelMode === 'multi'),
  isSingleModel: computed(() => config.value.modelMode === 'single'),
};

export const configActions = {
  setModelMode: (mode: ModelMode) => {
    config.value = { ...config.value, modelMode: mode };
    saveConfig(config.value);
  },

  setSingleModel: (model: string) => {
    config.value = { ...config.value, singleModel: model };
    saveConfig(config.value);
  },

  setThoughtInterval: (interval: number) => {
    config.value = { ...config.value, thoughtInterval: interval };
    saveConfig(config.value);
  },

  setThoughtCycleCount: (count: number) => {
    config.value = { ...config.value, thoughtCycleCount: count };
    saveConfig(config.value);
  },

  updateConfig: (partial: Partial<DoraemonConfig>) => {
    config.value = { ...config.value, ...partial };
    saveConfig(config.value);
  },

  resetConfig: () => {
    config.value = DEFAULT_CONFIG;
    saveConfig(config.value);
  },

  getConfig: () => config.value,
};
