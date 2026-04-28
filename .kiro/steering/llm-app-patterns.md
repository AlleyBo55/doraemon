---
inclusion: always
---

# LLM Application Patterns

> Production-ready patterns for building LLM applications.

## RAG Pipeline Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Ingest    │────▶│   Retrieve  │────▶│   Generate  │
│  Documents  │     │   Context   │     │   Response  │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Chunking Strategies
| Strategy | Use Case |
|----------|----------|
| Fixed-size | Simple, may break context |
| Semantic | Preserves meaning (paragraphs/sections) |
| Recursive | Tries multiple separators |
| Document-aware | Respects headers, lists |

**Recommended:** 512 tokens, 50 token overlap

### Retrieval Strategies

```typescript
// Basic semantic search
const results = await vectorDb.similaritySearch(queryEmbedding, topK);

// Hybrid search (semantic + keyword)
// alpha=1.0: Pure semantic, alpha=0.0: Pure keyword
const results = await hybridSearch(query, topK, alpha: 0.5);

// Multi-query retrieval (better recall)
const queries = await llm.generateQueryVariations(query, n: 3);
const results = await Promise.all(queries.map(q => semanticSearch(q)));
```

## Agent Architectures

### ReAct Pattern (Reasoning + Acting)
```
Thought: I need to search for X
Action: search("X")
Observation: [results]
Thought: Based on results, I should...
Final Answer: [response]
```

### Function Calling Pattern
```typescript
const response = await llm.chat({
  messages,
  tools: TOOLS,
  tool_choice: "auto"
});

if (response.tool_calls) {
  for (const call of response.tool_calls) {
    const result = await executeTool(call.name, call.arguments);
    messages.push({ role: "tool", content: result });
  }
}
```

## Production Patterns

### Caching Strategy
```typescript
// Only cache deterministic outputs (temperature=0)
const key = hash(`${model}:${prompt}:${JSON.stringify(kwargs)}`);
if (kwargs.temperature === 0) {
  redis.setex(key, ttl, response);
}
```

### Fallback Strategy
```typescript
const models = ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-sonnet"];
for (const model of models) {
  try {
    return await llm.generate(prompt, { model });
  } catch (e) {
    console.warn(`Model ${model} failed: ${e}`);
  }
}
throw new Error("All models exhausted");
```

## Metrics to Track

| Category | Metrics |
|----------|---------|
| Performance | latency_p50, latency_p99, tokens_per_second |
| Quality | user_satisfaction, task_completion, hallucination_rate |
| Cost | cost_per_request, tokens_per_request, cache_hit_rate |
| Reliability | error_rate, timeout_rate, retry_rate |

## Architecture Decision Matrix

| Pattern | Use When | Complexity | Cost |
|---------|----------|------------|------|
| Simple RAG | FAQ, docs search | Low | Low |
| Hybrid RAG | Mixed queries | Medium | Medium |
| ReAct Agent | Multi-step tasks | Medium | Medium |
| Function Calling | Structured tools | Low | Low |
| Multi-Agent | Research tasks | Very High | Very High |
