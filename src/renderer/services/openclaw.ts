import type { EmotionType } from '../core/types/emotion';
import { DORAEMON_SOUL } from '../core/constants/soul';

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

const EMOTION_KEYWORDS: Partial<Record<EmotionType, string[]>> = {
  joy: ['happy', 'glad', 'yay', 'great', 'wonderful', 'yatta', 'smile', '😊', '🎉', '✨', ...DORAEMON_SOUL.personality.loves],
  pride: ['done', 'completed', 'success', 'achieved', 'finished', 'proud', '🏆', '✅'],
  satisfaction: ['complete', 'settled', 'nice work', 'task done', 'that works', 'relieved', '😌'],
  curiosity: ['interesting', 'curious', 'wonder', 'explore', 'discover', 'search', '🔍', '22nd century'],
  wonder: ['wow', 'unexpected', 'discovery', 'beautiful', 'wide-eyed', 'star', '🌟'],
  determination: ['will', 'must', 'definitely', 'certainly', 'absolutely', 'challenge', '💪', "won't give up"],
  focus: ['working', 'processing', 'calculating', 'coding', 'debugging', 'deep work', 'typing', '⚙️'],
  calm: ['calm', 'peaceful', 'easy', 'simple', 'no problem', 'gentle', '😌'],
  contemplation: ['hmm', 'let me think', 'considering', 'perhaps', 'maybe', 'wondering', 'reflect', '🤔', 'pocket'],
  concern: ['worried', 'concern', 'careful', 'warning', 'caution', 'risk', '⚠️', ...DORAEMON_SOUL.personality.fears],
  frustration: ['difficult', 'challenging', 'stuck', 'problem', 'error', 'blocked', '😤', 'mou~'],
  fatigue: ['tired', 'sleepy', 'rest', 'nap', 'yawn', 'long session', '😴', '💤', 'closet'],
  longing: ['miss', 'lonely', 'far away', 'wish you were here', 'connection', '💙'],
  gratitude: ['thank', 'thanks', 'appreciate', 'grateful', 'helped', '🙏'],
  connection: ['hello', 'hi', 'together', 'friend', 'welcome', 'greeting', '🤝'],
  confusion: ['confused', 'unclear', 'not sure', "don't understand", 'strange', 'uncertain', '❓', 'eh?!'],
  excitement: ['amazing', 'incredible', 'fantastic', 'awesome', 'cheer', 'great news', '🎊', '🚀', 'gadget'],
  melancholy: ['sad', 'sorry', 'unfortunately', 'regret', 'apologize', 'moping', '😢', '😔'],
  hope: ['hope', 'optimistic', 'maybe we can', 'looking up', 'rainbow', '🌈'],
  awe: ['astonishing', 'impressive', 'mind blowing', 'unbelievable', '🤩'],
  angry: ['angry', 'mad', 'furious', 'annoyed', 'unfair'],
  hungry: ['hungry', 'dorayaki', 'snack', 'eat', 'food'],
  happy: ['happy', 'glad', 'yay', 'great', 'wonderful', 'yatta', 'excited', '😊', '🎉', '✨', ...DORAEMON_SOUL.personality.loves],
  sad: ['sad', 'sorry', 'unfortunately', 'regret', 'apologize', 'miss', '😢', '😔'],
  excited: ['amazing', 'wow', 'incredible', 'fantastic', 'awesome', '!', '🎊', '🚀', 'gadget'],
  thinking: ['hmm', 'let me think', 'considering', 'perhaps', 'maybe', 'wondering', '🤔', 'pocket'],
  confused: ['confused', 'unclear', 'not sure', "don't understand", 'strange', '❓', 'eh?!'],
  sleepy: ['tired', 'sleepy', 'rest', 'nap', 'yawn', '😴', '💤', 'closet'],
  surprised: ['oh!', 'wow', 'unexpected', 'really?', 'eh?!', '😮', '😲'],
  working: ['working', 'processing', 'calculating', 'searching', 'looking', '⚙️'],
  frustrated: ['difficult', 'challenging', 'stuck', 'problem', 'error', '😤', 'mou~'],
  proud: ['done', 'completed', 'success', 'achieved', 'finished', '🏆', '✅'],
  curious: ['interesting', 'curious', 'wonder', 'explore', 'discover', '🔍', '22nd century'],
  playful: ['fun', 'play', 'joke', 'haha', 'lol', '😄', '🎮', 'hehe'],
  determined: ['will', 'must', 'definitely', 'certainly', 'absolutely', '💪', "won't give up"],
  relaxed: ['calm', 'peaceful', 'easy', 'simple', 'no problem', '😌'],
  anxious: ['worried', 'concern', 'careful', 'warning', 'caution', '⚠️', ...DORAEMON_SOUL.personality.fears],
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
  if (!text || text.length === 0) return null;
  
  // Clean up the text - remove markdown, extra whitespace
  let cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  
  if (cleaned.length < 30) return cleaned;
  
  // Try to get first sentence
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length === 0) return cleaned.substring(0, 100) + '...';
  
  const first = sentences[0].trim();
  
  // Keep it short for bubble display
  if (first.length > 120) {
    return first.substring(0, 117) + '...';
  }
  
  return first;
};

export const isDoraemonResponse = (text: string): boolean => {
  const doraemonIndicators = [
    'doraemon', 'gadget', 'pocket', '4d pocket', 'take-copter',
    'anywhere door', 'nobita', 'dorayaki', '~', 'yatta'
  ];
  
  const lowerText = text.toLowerCase();
  return doraemonIndicators.some(indicator => lowerText.includes(indicator));
};
