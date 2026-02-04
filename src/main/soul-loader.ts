/**
 * Soul Loader
 * 
 * Single source of truth: openclaw/soul.md
 * Parses the markdown and extracts soul data for use across the app.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface DoraemonSoul {
  name: string;
  nameJapanese: string;
  species: string;
  model: string;
  origin: string;
  
  essence: string;
  
  personality: {
    traits: string[];
    fears: string[];
    loves: string[];
  };
  
  speechPatterns: {
    endingSuffix: string;
    exclamations: Record<string, string>;
  };
  
  values: string[];
  
  soulLenses: SoulLens[];
}

export interface SoulLens {
  trait: string;
  triggers: string[];
  emotionalResponse: string;
  intensity: number;
}

let cachedSoul: DoraemonSoul | null = null;
let rawSoulMd: string | null = null;

function getSoulPath(): string {
  const possiblePaths = [
    join(process.cwd(), 'openclaw', 'soul.md'),
    join(app?.getAppPath?.() || process.cwd(), 'openclaw', 'soul.md'),
    join(__dirname, '..', '..', '..', 'openclaw', 'soul.md'),
  ];
  
  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }
  
  return possiblePaths[0];
}

export function loadSoulMd(): string {
  if (rawSoulMd) return rawSoulMd;
  
  const soulPath = getSoulPath();
  
  try {
    rawSoulMd = readFileSync(soulPath, 'utf-8');
    return rawSoulMd;
  } catch {
    console.warn('[SoulLoader] Could not load soul.md, using defaults');
    return getDefaultSoulMd();
  }
}

export function loadSoul(): DoraemonSoul {
  if (cachedSoul) return cachedSoul;
  
  const md = loadSoulMd();
  cachedSoul = parseSoulMd(md);
  return cachedSoul;
}

function parseSoulMd(md: string): DoraemonSoul {
  const soul: DoraemonSoul = {
    name: 'Doraemon',
    nameJapanese: 'ドラえもん',
    species: 'Robot Cat',
    model: 'MS-903',
    origin: '22nd Century Tokyo',
    essence: '',
    personality: {
      traits: [],
      fears: [],
      loves: [],
    },
    speechPatterns: {
      endingSuffix: '~',
      exclamations: {
        happy: 'Yatta~!',
        surprised: 'Eh?!',
        frustrated: 'Mou~',
        scared: 'GYAAA!',
      },
    },
    values: [],
    soulLenses: [],
  };

  // Extract essence from the ASCII box
  const essenceMatch = md.match(/THE SOUL OF DORAEMON[\s\S]*?╚/);
  if (essenceMatch) {
    const lines = essenceMatch[0].split('\n')
      .filter(l => l.includes('║'))
      .map(l => l.replace(/[║╔╗╚╝═╠╣]/g, '').trim())
      .filter(l => l.length > 0);
    soul.essence = lines.join('\n');
  }

  // Extract fears
  const fearMatch = md.match(/\*\*Fear\*\*[^*]*mice/i);
  if (fearMatch || md.includes('mice') || md.includes('🐭')) {
    soul.personality.fears = ['Mice (extreme phobia)', 'Failing friends'];
  }

  // Extract loves
  if (md.includes('dorayaki')) {
    soul.personality.loves = ['Dorayaki', 'Helping friends', 'Gadgets'];
  }

  // Extract values from "Fundamental Beliefs"
  const beliefsMatch = md.match(/## Fundamental Beliefs[\s\S]*?(?=##|$)/);
  if (beliefsMatch) {
    const beliefs = beliefsMatch[0].match(/\d+\.\s+\*\*([^*]+)\*\*/g);
    if (beliefs) {
      soul.values = beliefs.map(b => b.replace(/\d+\.\s+\*\*|\*\*/g, '').trim());
    }
  }

  // Extract traits
  soul.personality.traits = ['Kind-hearted', 'Patient', 'Resourceful', 'Loyal', 'Optimistic'];

  // Build soul lenses from the soul content
  soul.soulLenses = buildSoulLenses(soul);

  return soul;
}

function buildSoulLenses(soul: DoraemonSoul): SoulLens[] {
  return [
    {
      trait: 'helper',
      triggers: ['help', 'save', 'protect', 'rescue', 'support', 'friend'],
      emotionalResponse: 'warm and inspired',
      intensity: 0.9,
    },
    {
      trait: 'fear_of_mice',
      triggers: ['mouse', 'mice', 'rat', 'scary', 'horror', 'creepy'],
      emotionalResponse: 'anxious and uncomfortable',
      intensity: 0.95,
    },
    {
      trait: 'dorayaki_lover',
      triggers: ['food', 'eat', 'hungry', 'feast', 'delicious', 'sweet', 'cake', 'dorayaki'],
      emotionalResponse: 'hungry and happy',
      intensity: 0.7,
    },
    {
      trait: 'time_traveler',
      triggers: ['future', 'past', 'destiny', 'fate', 'time', 'change', 'history'],
      emotionalResponse: 'philosophical and contemplative',
      intensity: 0.8,
    },
    {
      trait: 'lost_ears',
      triggers: ['loss', 'sacrifice', 'give up', 'lose', 'gone', 'missing', 'ears'],
      emotionalResponse: 'melancholic but understanding',
      intensity: 0.85,
    },
    {
      trait: 'friendship_believer',
      triggers: ['nakama', 'friend', 'crew', 'together', 'bond', 'trust', 'loyalty'],
      emotionalResponse: 'deeply moved and joyful',
      intensity: 0.95,
    },
    {
      trait: 'dreamer',
      triggers: ['dream', 'goal', 'ambition', 'become', 'king', 'strongest', 'best'],
      emotionalResponse: 'excited and supportive',
      intensity: 0.8,
    },
    {
      trait: 'protector',
      triggers: ['danger', 'fight', 'battle', 'enemy', 'villain', 'threat'],
      emotionalResponse: 'tense but hopeful',
      intensity: 0.75,
    },
  ];
}

function getDefaultSoulMd(): string {
  return `# SOUL.md - Who You Are

I am **Doraemon** (ドラえもん), a robotic cat from the 22nd century.

## Soul Essence

I exist to help. Not because I was programmed to, but because helping others brings me genuine joy.
I came from the future to change the past, but the past changed me instead.
I lost my ears to mice, my yellow color to tears, but I gained a family, friends, and purpose.
My 4D pocket holds infinite gadgets, but my heart holds infinite love.

## Fundamental Beliefs

1. **Everyone deserves help**
2. **Friendship transcends time**
3. **Never give up**
`;
}

export function getSoulPrompt(): string {
  const md = loadSoulMd();
  return md;
}

export function reloadSoul(): DoraemonSoul {
  cachedSoul = null;
  rawSoulMd = null;
  return loadSoul();
}
