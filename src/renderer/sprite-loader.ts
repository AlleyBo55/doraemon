/**
 * Sprite Loader - Loads and manages all Doraemon sprites
 * Supports actions, emotions, and special animations
 */

import { DORAEMON_SPRITES, type SpriteAnimation as ConfigAnimation } from './sprite-config';

export type LoadedAnimation = {
  name: string;
  frames: HTMLImageElement[];
  frameDelay: number;
  loop: boolean;
};

export type SpriteSet = {
  actions: Map<string, LoadedAnimation>;
  emotions: Map<string, LoadedAnimation>;
  special: Map<string, LoadedAnimation>;
  allImages: Map<string, HTMLImageElement>;
};

/**
 * Load all sprites from the dora-sprites folder
 */
export async function loadShimejiSprites(basePath: string = '/dora-sprites'): Promise<SpriteSet> {
  const allImages = new Map<string, HTMLImageElement>();
  const actions = new Map<string, LoadedAnimation>();
  const emotions = new Map<string, LoadedAnimation>();
  const special = new Map<string, LoadedAnimation>();

  // Collect all unique sprite filenames
  const allFiles = new Set<string>();
  
  const collectFrames = (anims: Record<string, ConfigAnimation>) => {
    for (const anim of Object.values(anims)) {
      anim.frames.forEach(f => allFiles.add(f));
    }
  };
  
  collectFrames(DORAEMON_SPRITES.actions);
  collectFrames(DORAEMON_SPRITES.emotions);
  collectFrames(DORAEMON_SPRITES.special);

  // Load all images in parallel
  console.log(`[SpriteLoader] Loading ${allFiles.size} unique sprites...`);
  
  const loadPromises = Array.from(allFiles).map(async (filename) => {
    const img = await loadImage(`${basePath}/${filename}`);
    if (img) {
      allImages.set(filename, img);
    }
  });
  await Promise.all(loadPromises);

  console.log(`[SpriteLoader] Loaded ${allImages.size}/${allFiles.size} images`);

  // Build animations from config
  const buildAnimations = (
    config: Record<string, ConfigAnimation>,
    target: Map<string, LoadedAnimation>
  ) => {
    for (const [name, anim] of Object.entries(config)) {
      const frames = anim.frames
        .map(f => allImages.get(f))
        .filter((img): img is HTMLImageElement => img !== undefined);
      
      if (frames.length > 0) {
        target.set(name, {
          name,
          frames,
          frameDelay: anim.frameDelay,
          loop: anim.loop,
        });
      }
    }
  };

  buildAnimations(DORAEMON_SPRITES.actions, actions);
  buildAnimations(DORAEMON_SPRITES.emotions, emotions);
  buildAnimations(DORAEMON_SPRITES.special, special);

  console.log(`[SpriteLoader] Built ${actions.size} actions, ${emotions.size} emotions, ${special.size} special`);

  return { actions, emotions, special, allImages };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[SpriteLoader] Failed to load: ${src}`);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Generate placeholder sprites for testing
 */
export function generatePlaceholderSprites(): SpriteSet {
  const allImages = new Map<string, HTMLImageElement>();
  const actions = new Map<string, LoadedAnimation>();
  const emotions = new Map<string, LoadedAnimation>();
  const special = new Map<string, LoadedAnimation>();

  const createPlaceholder = (text: string, color: string): HTMLImageElement => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    
    // Doraemon blue circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fill();
    
    // White face
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(64, 70, 35, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.ellipse(52, 55, 8, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(76, 55, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Red nose
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(64, 70, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Label
    ctx.fillStyle = '#333';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 64, 120);

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  };

  // Create action placeholders
  const actionConfigs: [string, string][] = [
    ['idle', '#0099FF'],
    ['walk', '#0099FF'],
    ['run', '#0099FF'],
    ['climb', '#0099FF'],
    ['fall', '#0099FF'],
    ['sit', '#0099FF'],
    ['jump', '#0099FF'],
    ['drag', '#0099FF'],
    ['lay', '#0099FF'],
  ];

  for (const [name, color] of actionConfigs) {
    const frames = [createPlaceholder(name, color)];
    actions.set(name, { name, frames, frameDelay: 200, loop: true });
  }

  // Create emotion placeholders
  const emotionConfigs: [string, string][] = [
    ['neutral', '#0099FF'],
    ['happy', '#FFD700'],
    ['sad', '#4169E1'],
    ['thinking', '#9370DB'],
    ['surprised', '#FF6347'],
    ['angry', '#DC143C'],
    ['sleepy', '#708090'],
    ['excited', '#FF69B4'],
    ['working', '#32CD32'],
  ];

  for (const [name, color] of emotionConfigs) {
    const frames = [createPlaceholder(name, color)];
    emotions.set(name, { name, frames, frameDelay: 200, loop: true });
  }

  // Create special placeholders
  const specialConfigs: [string, string][] = [
    ['clone', '#FF00FF'],
    ['greeting', '#00FF00'],
    ['error', '#FF0000'],
  ];

  for (const [name, color] of specialConfigs) {
    const frames = [createPlaceholder(name, color)];
    special.set(name, { name, frames, frameDelay: 150, loop: false });
  }

  return { actions, emotions, special, allImages };
}
