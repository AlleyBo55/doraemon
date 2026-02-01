import type { SpriteState } from '../core/constants/sprite';
import { Ok, Err, type Result } from '../core/utils/result';

type SpriteFrame = {
  image: HTMLImageElement;
  width: number;
  height: number;
};

type SpriteSheet = {
  state: SpriteState;
  frames: SpriteFrame[];
  frameCount: number;
};

const cache = new Map<string, SpriteSheet>();
const loading = new Map<string, Promise<SpriteSheet>>();

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });

export const loadSprite = async (
  state: SpriteState,
  basePath: string
): Promise<Result<SpriteSheet, Error>> => {
  const key = `${basePath}/${state}`;

  if (cache.has(key)) {
    return Ok(cache.get(key)!);
  }

  if (loading.has(key)) {
    try {
      const sheet = await loading.get(key)!;
      return Ok(sheet);
    } catch (e) {
      return Err(e instanceof Error ? e : new Error('Load failed'));
    }
  }

  const promise = (async () => {
    const src = `${basePath}/${state}.png`;
    const image = await loadImage(src);

    const sheet: SpriteSheet = {
      state,
      frames: [{ image, width: image.width, height: image.height }],
      frameCount: 1,
    };

    cache.set(key, sheet);
    loading.delete(key);
    return sheet;
  })();

  loading.set(key, promise);

  try {
    const sheet = await promise;
    return Ok(sheet);
  } catch (e) {
    loading.delete(key);
    return Err(e instanceof Error ? e : new Error('Load failed'));
  }
};

export const preloadSprites = async (
  states: SpriteState[],
  basePath: string
): Promise<void> => {
  await Promise.all(states.map((s) => loadSprite(s, basePath)));
};

export const clearCache = (): void => {
  cache.clear();
  loading.clear();
};
