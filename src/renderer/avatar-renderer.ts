/**
 * Avatar Renderer - Handles sprite-based or Live2D avatar display
 */

import type { Emotion } from './emotion-engine';

export type AvatarConfig = {
  type: 'sprite' | 'live2d';
  basePath: string;
};

export class AvatarRenderer {
  private container: HTMLElement;
  private imgElement: HTMLImageElement;
  private config: AvatarConfig;
  private currentEmotion: Emotion = 'neutral';

  constructor(container: HTMLElement, config: AvatarConfig) {
    this.container = container;
    this.config = config;
    this.imgElement = container.querySelector('#avatar') as HTMLImageElement;
    
    if (!this.imgElement) {
      throw new Error('Avatar image element not found');
    }

    this.loadEmotion('neutral');
  }

  setEmotion(emotion: Emotion, intensity: number = 0.5) {
    if (this.currentEmotion !== emotion) {
      this.currentEmotion = emotion;
      this.loadEmotion(emotion);
    }
  }

  private loadEmotion(emotion: Emotion) {
    if (this.config.type === 'sprite') {
      this.loadSprite(emotion);
    } else {
      this.loadLive2DMotion(emotion);
    }
  }

  private loadSprite(emotion: Emotion) {
    const spritePath = `${this.config.basePath}/${emotion}.png`;
    
    // Fade transition
    this.imgElement.style.opacity = '0.5';
    
    const img = new Image();
    img.onload = () => {
      this.imgElement.src = spritePath;
      this.imgElement.style.opacity = '1';
    };
    img.onerror = () => {
      // Fallback to neutral if emotion sprite doesn't exist
      if (emotion !== 'neutral') {
        console.warn(`Sprite not found for emotion: ${emotion}, falling back to neutral`);
        this.loadSprite('neutral');
      } else {
        // Show placeholder
        this.imgElement.src = this.getPlaceholderDataUrl();
        this.imgElement.style.opacity = '1';
      }
    };
    img.src = spritePath;
  }

  private loadLive2DMotion(_emotion: Emotion) {
    // Live2D implementation would go here
    // For now, fall back to sprite
    console.log('Live2D not yet implemented, using sprite fallback');
    this.loadSprite(_emotion);
  }

  private getPlaceholderDataUrl(): string {
    // Simple SVG placeholder
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
        <rect fill="#f0f0f0" width="200" height="300" rx="20"/>
        <circle fill="#ddd" cx="100" cy="100" r="50"/>
        <circle fill="#333" cx="85" cy="90" r="5"/>
        <circle fill="#333" cx="115" cy="90" r="5"/>
        <path fill="none" stroke="#333" stroke-width="3" d="M80 115 Q100 130 120 115"/>
        <text x="100" y="200" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">
          Place avatar here
        </text>
        <text x="100" y="220" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#999">
          sprites/*.png
        </text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
}

/**
 * Create placeholder sprites for testing
 * Run this to generate basic placeholder images
 */
export function generatePlaceholderSprites(): Record<Emotion, string> {
  const emotions: Record<Emotion, { face: string; color: string }> = {
    neutral: { face: '😊', color: '#f0f0f0' },
    happy: { face: '😄', color: '#fffacd' },
    sad: { face: '😢', color: '#e0e8ff' },
    thinking: { face: '🤔', color: '#f0e6ff' },
    surprised: { face: '😮', color: '#fff0e6' },
    angry: { face: '😠', color: '#ffe6e6' },
    sleepy: { face: '😴', color: '#e6f0ff' },
    working: { face: '💪', color: '#e6ffe6' },
    excited: { face: '✨', color: '#fff0f5' },
  };

  const sprites: Record<string, string> = {};

  for (const [emotion, { face, color }] of Object.entries(emotions)) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
        <rect fill="${color}" width="200" height="300" rx="20"/>
        <text x="100" y="150" text-anchor="middle" font-size="80">${face}</text>
        <text x="100" y="250" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">
          ${emotion}
        </text>
      </svg>
    `;
    sprites[emotion] = `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  return sprites as Record<Emotion, string>;
}
