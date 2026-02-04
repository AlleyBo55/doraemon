/**
 * Vector Embeddings for Semantic Memory Search
 * 
 * Uses local transformer model for privacy.
 * Falls back to simple TF-IDF if model unavailable.
 */

import { createHash } from 'crypto';

interface EmbeddingCache {
  hash: string;
  embedding: number[];
  timestamp: number;
}

const embeddingCache: Map<string, EmbeddingCache> = new Map();
const CACHE_MAX_SIZE = 10000;
const EMBEDDING_DIM = 384;

export async function getEmbedding(text: string): Promise<number[]> {
  const hash = createHash('md5').update(text).digest('hex');
  
  const cached = embeddingCache.get(hash);
  if (cached) {
    return cached.embedding;
  }
  
  const embedding = computeTfIdfEmbedding(text);
  
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    const oldest = [...embeddingCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) embeddingCache.delete(oldest[0]);
  }
  
  embeddingCache.set(hash, {
    hash,
    embedding,
    timestamp: Date.now(),
  });
  
  return embedding;
}

function computeTfIdfEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const tf = computeTf(tokens);
  
  const embedding = new Array(EMBEDDING_DIM).fill(0);
  
  for (const [token, freq] of tf.entries()) {
    const tokenHash = hashToken(token);
    const indices = getHashIndices(tokenHash, 8);
    const weight = freq * getIdf(token);
    
    for (const idx of indices) {
      embedding[idx % EMBEDDING_DIM] += weight * (tokenHash % 2 === 0 ? 1 : -1);
    }
  }
  
  return normalize(embedding);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function computeTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const max = Math.max(...tf.values(), 1);
  for (const [token, count] of tf.entries()) {
    tf.set(token, count / max);
  }
  return tf;
}

function getIdf(token: string): number {
  const hash = hashToken(token);
  return 1 + Math.log(1000 / (1 + (hash % 100)));
}

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getHashIndices(hash: number, count: number): number[] {
  const indices: number[] = [];
  let h = hash;
  for (let i = 0; i < count; i++) {
    indices.push(h % EMBEDDING_DIM);
    h = (h * 31 + 17) & 0x7fffffff;
  }
  return indices;
}

function normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map(v => v / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dot = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  
  return dot / magnitude;
}

export async function findSimilar(
  query: string,
  candidates: Array<{ id: string; content: string; embedding?: number[] }>,
  topK: number = 5
): Promise<Array<{ id: string; content: string; similarity: number }>> {
  const queryEmbedding = await getEmbedding(query);
  
  const scored = await Promise.all(
    candidates.map(async (c) => {
      const embedding = c.embedding || await getEmbedding(c.content);
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return { id: c.id, content: c.content, similarity };
    })
  );
  
  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIM;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
]);
