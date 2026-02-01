import type { EmotionType } from '../core/types/emotion';

export type OpenClawMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

export type OpenClawSession = {
  id: string;
  messages: OpenClawMessage[];
  emotion: EmotionType;
};

const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  happy: ['happy', 'glad', 'yay', 'great', 'wonderful', 'yatta', 'excited', '😊', '🎉', '✨'],
  sad: ['sad', 'sorry', 'unfortunately', 'regret', 'apologize', 'miss', '😢', '😔'],
  excited: ['amazing', 'wow', 'incredible', 'fantastic', 'awesome', '!', '🎊', '🚀'],
  thinking: ['hmm', 'let me think', 'considering', 'perhaps', 'maybe', 'wondering', '🤔'],
  confused: ['confused', 'unclear', 'not sure', "don't understand", 'strange', '❓'],
  sleepy: ['tired', 'sleepy', 'rest', 'nap', 'yawn', '😴', '💤'],
  surprised: ['oh!', 'wow', 'unexpected', 'really?', 'eh?!', '😮', '😲'],
  working: ['working', 'processing', 'calculating', 'searching', 'looking', '⚙️'],
  frustrated: ['difficult', 'challenging', 'stuck', 'problem', 'error', '😤'],
  proud: ['done', 'completed', 'success', 'achieved', 'finished', '🏆', '✅'],
  curious: ['interesting', 'curious', 'wonder', 'explore', 'discover', '🔍'],
  playful: ['fun', 'play', 'joke', 'haha', 'lol', '😄', '🎮'],
  determined: ['will', 'must', 'definitely', 'certainly', 'absolutely', '💪'],
  relaxed: ['calm', 'peaceful', 'easy', 'simple', 'no problem', '😌'],
  anxious: ['worried', 'concern', 'careful', 'warning', 'caution', '⚠️'],
  neutral: [],
};

export const detectEmotion = (text: string): EmotionType => {
  const lowerText = text.toLowerCase();
  
  let bestMatch: EmotionType = 'neutral';
  let maxScore = 0;

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (emotion === 'neutral') continue;
    
    let score = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += keyword.length > 2 ? 2 : 1;
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = emotion as EmotionType;
    }
  }

  return bestMatch;
};

export const extractThought = (text: string): string | null => {
  if (text.length < 20) return text;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return null;
  
  const first = sentences[0].trim();
  return first.length > 50 ? first.substring(0, 47) + '...' : first;
};

export const isDoraemonResponse = (text: string): boolean => {
  const doraemonIndicators = [
    'doraemon', 'gadget', 'pocket', '4d pocket', 'take-copter',
    'anywhere door', 'nobita', 'dorayaki', '~', 'yatta'
  ];
  
  const lowerText = text.toLowerCase();
  return doraemonIndicators.some(indicator => lowerText.includes(indicator));
};
