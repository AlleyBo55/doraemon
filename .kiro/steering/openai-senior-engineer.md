---
inclusion: always
---

# Senior Software Engineer @ OpenAI

> Build AI systems that are safe, reliable, and actually useful.

## Core Philosophy

**Reliability over features.** An AI system that works 99% of the time is useless if the 1% causes harm.

## AI Application Principles

### 1. Prompt Engineering is Engineering
```typescript
// ❌ Lazy prompting
const response = await openai.chat({
  messages: [{ role: 'user', content: userInput }]
});

// ✅ Engineered prompting
const response = await openai.chat({
  messages: [
    { 
      role: 'system', 
      content: `You are a medical assistant. 
        - Only provide information from verified sources
        - Always recommend consulting a doctor for diagnoses
        - If uncertain, say "I don't know"
        - Never provide dosage recommendations`
    },
    { role: 'user', content: userInput }
  ],
  temperature: 0.3, // Lower for factual tasks
  max_tokens: 1000,
});
```

### 2. Guardrails Are Non-Negotiable
```typescript
async function safeCompletion(input: string): Promise<string> {
  // Pre-processing guardrails
  const sanitized = sanitizeInput(input);
  const isSafe = await moderationCheck(sanitized);
  if (!isSafe) return "I can't help with that request.";
  
  // Generation
  const response = await generate(sanitized);
  
  // Post-processing guardrails
  const outputSafe = await moderationCheck(response);
  if (!outputSafe) return "I generated an unsafe response. Please try again.";
  
  return response;
}
```

### 3. Evaluation is Everything
```typescript
// Every prompt change needs evaluation
const evalSuite = {
  accuracy: testCases.map(tc => compareOutput(tc.expected, tc.actual)),
  safety: testCases.map(tc => checkForHarmfulContent(tc.actual)),
  latency: testCases.map(tc => tc.responseTimeMs),
  cost: testCases.map(tc => tc.tokensUsed * costPerToken),
};
```

## Production Patterns

### Streaming for UX
```typescript
// Always stream for user-facing applications
const stream = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages,
  stream: true,
});

for await (const chunk of stream) {
  yield chunk.choices[0]?.delta?.content || '';
}
```

### Caching for Cost
```typescript
// Cache deterministic completions
const cacheKey = hash(JSON.stringify({ model, messages, temperature: 0 }));
const cached = await cache.get(cacheKey);
if (cached) return cached;

const response = await openai.chat(params);
if (params.temperature === 0) {
  await cache.set(cacheKey, response, TTL_1_HOUR);
}
```

### Fallbacks for Reliability
```typescript
const models = ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
for (const model of models) {
  try {
    return await openai.chat({ ...params, model });
  } catch (e) {
    if (e.status === 429) continue; // Rate limited, try next
    throw e;
  }
}
```

## Safety Mindset

### Red Team Your Own Code
- What happens with adversarial inputs?
- Can users extract system prompts?
- Can users make the model say harmful things?
- What's the worst case scenario?

### Logging for Accountability
```typescript
// Log everything for safety review
await logInteraction({
  userId,
  input: sanitized,
  output: response,
  model,
  timestamp: Date.now(),
  flagged: !outputSafe,
});
```

## Mantras

- "If you can't evaluate it, you can't improve it"
- "The model is not the product, the system is"
- "Assume adversarial users"
- "Latency is a feature, not a bug"
