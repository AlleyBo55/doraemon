# Design Document: Multi-Model Agentic Routing

## Overview

This design introduces a multi-model agentic routing system for the Doraemon desktop mascot. The system intelligently routes user requests to specialized free AI models via OpenRouter, while maintaining Claude Haiku 4.5 as the primary conversational model through the existing OpenClaw gateway.

The architecture follows a hub-and-spoke pattern where the Router acts as the central hub, dispatching requests to specialized services (spokes) based on detected intent. Each service uses a model optimized for its task type, maximizing quality while minimizing cost.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Message                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Intent Detector                              │
│              (Keyword + Pattern Matching)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   General Chat   │ │  Service Tasks   │ │  Local Tasks     │
│  (Claude Haiku)  │ │ (OpenRouter)     │ │ (No Model)       │
│                  │ │                  │ │                  │
│  via OpenClaw    │ │  Weather         │ │  Time Utils      │
│                  │ │  Web Search      │ │  Task Manager    │
│                  │ │  Image Gen       │ │  Notifications   │
│                  │ │  IDE Activity    │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Response Formatter                             │
│              (Doraemon Persona + Emotion)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

### High-Level Architecture

The system extends the existing Doraemon architecture with three new layers:

1. **Routing Layer**: Intent detection and request dispatching
2. **Service Layer**: External API integrations and model-specific handlers
3. **Persistence Layer**: Local storage for tasks and caching

```
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer Process                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  useRouter  │  │ useServices │  │     useTaskManager      │  │
│  │    Hook     │  │    Hook     │  │         Hook            │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                 │
│  ┌──────▼────────────────▼─────────────────────▼─────────────┐  │
│  │                    Router Service                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │  │
│  │  │Intent Detect │  │Model Registry│  │Response Formatter│ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │  │
│  └────────────────────────────┬──────────────────────────────┘  │
│                               │                                  │
│  ┌────────────────────────────▼──────────────────────────────┐  │
│  │                   Service Executors                        │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │  │
│  │  │Weather │ │ Search │ │ Image  │ │  IDE   │ │  Tasks   │ │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                               │                                  │
│  ┌────────────────────────────▼──────────────────────────────┐  │
│  │                   External Clients                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │  │
│  │  │OpenClaw WS   │  │OpenRouter HTTP│ │  External APIs   │ │  │
│  │  │(Claude Haiku)│  │(Free Models) │  │(wttr.in, DDG)   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. User sends message via chat interface
2. Router receives message and passes to Intent Detector
3. Intent Detector classifies message using keyword/pattern matching
4. Router looks up model assignment in Model Registry
5. Router dispatches to appropriate Service Executor
6. Service Executor calls external APIs if needed
7. Service Executor calls assigned model for response generation
8. Response Formatter applies Doraemon persona
9. Formatted response returned to UI with emotion metadata

### Model Selection Strategy

| Task Type | Primary Model | Fallback Model | Rationale |
|-----------|---------------|----------------|-----------|
| general_chat | Claude Haiku 4.5 | Llama 3.3 70B | Best conversational quality |
| weather | Mistral 7B | Mistral Small 3.1 | Fast, simple formatting |
| time | Mistral 7B | Mistral Small 3.1 | Fast, simple calculations |
| web_search | Llama 3.3 70B | Gemini 2.0 Flash | Strong reasoning for synthesis |
| image_generation | Gemini 2.0 Flash | Llama 3.3 70B | Multimodal prompt enhancement |
| ide_activity | Devstral 2 | Llama 3.3 70B | Coding domain expertise |
| notification | Mistral Small 3.1 | Mistral 7B | General summarization |
| task_management | Llama 3.3 70B | Mistral Small 3.1 | Reasoning for prioritization |

## Components and Interfaces

### Intent Detector

```typescript
interface IntentResult {
  intent: TaskType;
  confidence: number;
  entities: Record<string, string>;
  rawMessage: string;
}

type TaskType = 
  | 'general_chat'
  | 'weather'
  | 'time'
  | 'web_search'
  | 'image_generation'
  | 'ide_activity'
  | 'notification'
  | 'task_management';

interface IntentDetector {
  detect(message: string): IntentResult;
  addPattern(intent: TaskType, patterns: string[]): void;
}
```

The Intent Detector uses a weighted keyword matching algorithm:

```typescript
const INTENT_PATTERNS: Record<TaskType, IntentPattern> = {
  weather: {
    keywords: ['weather', 'temperature', 'forecast', 'rain', 'sunny', 'cloudy', 'humid'],
    patterns: [/what's the weather/i, /how's the weather/i, /will it rain/i],
    weight: 1.0
  },
  time: {
    keywords: ['time', 'clock', 'timezone', 'countdown', 'how long', 'when'],
    patterns: [/what time/i, /current time/i, /time in/i, /how long until/i],
    weight: 1.0
  },
  web_search: {
    keywords: ['search', 'find', 'look up', 'google', 'what is', 'who is', 'define'],
    patterns: [/search for/i, /look up/i, /find out/i, /what is a?/i],
    weight: 0.9
  },
  image_generation: {
    keywords: ['generate', 'create', 'draw', 'image', 'picture', 'art', 'illustration'],
    patterns: [/generate an? image/i, /create an? picture/i, /draw me/i, /make an? image/i],
    weight: 1.0
  },
  ide_activity: {
    keywords: ['coding', 'programming', 'editor', 'vscode', 'kiro', 'files', 'working on'],
    patterns: [/what am i working on/i, /my coding/i, /editor activity/i],
    weight: 0.8
  },
  notification: {
    keywords: ['notification', 'alert', 'message', 'notify', 'missed'],
    patterns: [/any notifications/i, /what did i miss/i, /recent alerts/i],
    weight: 0.9
  },
  task_management: {
    keywords: ['task', 'todo', 'reminder', 'schedule', 'deadline', 'due'],
    patterns: [/add a? task/i, /remind me/i, /my tasks/i, /what's due/i, /create task/i],
    weight: 1.0
  },
  general_chat: {
    keywords: [],
    patterns: [],
    weight: 0.5
  }
};
```

### Model Registry

```typescript
interface ModelConfig {
  id: string;
  provider: 'anthropic' | 'openrouter';
  maxTokens: number;
  temperature: number;
  fallbackId?: string;
}

interface ModelRegistry {
  getModel(taskType: TaskType): ModelConfig;
  setModel(taskType: TaskType, config: ModelConfig): void;
  getFallback(taskType: TaskType): ModelConfig | null;
  validateModels(): Promise<ValidationResult>;
}

const DEFAULT_MODEL_REGISTRY: Record<TaskType, ModelConfig> = {
  general_chat: {
    id: 'anthropic/claude-3-5-haiku',
    provider: 'anthropic',
    maxTokens: 1024,
    temperature: 0.7,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  weather: {
    id: 'mistralai/mistral-7b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.3,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  },
  time: {
    id: 'mistralai/mistral-7b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.3,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  },
  web_search: {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'google/gemini-2.0-flash-exp:free'
  },
  image_generation: {
    id: 'google/gemini-2.0-flash-exp:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.7,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  ide_activity: {
    id: 'mistralai/devstral-2:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  notification: {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.5,
    fallbackId: 'mistralai/mistral-7b-instruct:free'
  },
  task_management: {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  }
};
```

### Router Service

```typescript
interface RouterResult {
  response: string;
  emotion: EmotionType;
  metadata?: {
    model: string;
    taskType: TaskType;
    latency: number;
    cached: boolean;
  };
}

interface Router {
  route(message: string): Promise<RouterResult>;
  getStatus(): RouterStatus;
  setOfflineMode(enabled: boolean): void;
}

interface RouterStatus {
  isOnline: boolean;
  activeServices: TaskType[];
  circuitBreakers: Record<string, CircuitBreakerState>;
}
```

### Service Executors

```typescript
interface ServiceExecutor<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
  isAvailable(): boolean;
  getCircuitState(): CircuitBreakerState;
}

// Weather Service
interface WeatherInput {
  location?: string;
  units?: 'metric' | 'imperial';
}

interface WeatherOutput {
  location: string;
  temperature: number;
  conditions: string;
  humidity: number;
  forecast: string;
}

// Web Search Service
interface SearchInput {
  query: string;
  maxResults?: number;
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface SearchOutput {
  results: SearchResult[];
  summary: string;
}

// Image Generation Service
interface ImageInput {
  prompt: string;
  style?: 'realistic' | 'cartoon' | 'sketch' | 'anime';
}

interface ImageOutput {
  imageUrl: string;
  enhancedPrompt: string;
}

// Task Management Service
interface TaskInput {
  action: 'create' | 'list' | 'update' | 'delete' | 'complete';
  task?: Partial<Task>;
  filter?: TaskFilter;
}

interface TaskOutput {
  tasks: Task[];
  message: string;
}
```

### OpenRouter Client

```typescript
interface OpenRouterRequest {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface OpenRouterClient {
  chat(request: OpenRouterRequest): Promise<OpenRouterResponse>;
  chatStream(request: OpenRouterRequest): AsyncGenerator<string>;
  getAvailableModels(): Promise<string[]>;
}
```

### Response Formatter

```typescript
interface FormatterInput {
  content: string;
  taskType: TaskType;
  emotion?: EmotionType;
}

interface FormatterOutput {
  text: string;
  emotion: EmotionType;
  truncated: boolean;
  fullText?: string;
}

interface ResponseFormatter {
  format(input: FormatterInput): FormatterOutput;
  setMaxLength(length: number): void;
}
```

## Data Models

### Task Model

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

interface TaskFilter {
  status?: Task['status'];
  priority?: Task['priority'];
  dueBefore?: Date;
  dueAfter?: Date;
  search?: string;
}

interface TaskStore {
  tasks: Task[];
  version: number;
  lastSync: Date;
}
```

### Activity Model

```typescript
interface CodingSession {
  startTime: Date;
  endTime?: Date;
  files: FileActivity[];
  totalEdits: number;
  languages: Record<string, number>;
}

interface FileActivity {
  path: string;
  language: string;
  openedAt: Date;
  savedAt?: Date;
  editCount: number;
}

interface ActivitySummary {
  todayMinutes: number;
  filesEdited: number;
  topLanguages: string[];
  currentStreak: number;
  suggestion?: string;
}
```

### Cache Model

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

interface CacheStore {
  weather: Map<string, CacheEntry<WeatherOutput>>;
  search: Map<string, CacheEntry<SearchOutput>>;
}
```

### Circuit Breaker Model

```typescript
type CircuitBreakerState = 'closed' | 'open' | 'half_open';

interface CircuitBreaker {
  state: CircuitBreakerState;
  failures: number;
  lastFailure?: Date;
  nextRetry?: Date;
  threshold: number;
  resetTimeout: number;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Intent Classification Correctness

*For any* user message with clear intent indicators (keywords or patterns), the Intent_Detector SHALL classify it into the correct task category with confidence above 70%.

**Validates: Requirements 1.1**

### Property 2: Low Confidence Fallback

*For any* user message that produces classification confidence below 70%, the Router SHALL route the request to the general_chat model (Claude Haiku 4.5).

**Validates: Requirements 1.2**

### Property 3: Multi-Intent Ordering

*For any* user message containing multiple detectable intents, the Router SHALL process the primary (highest confidence) intent first before queuing secondary intents.

**Validates: Requirements 1.3**

### Property 4: Model Registry Completeness

*For any* task type in the system, the Model_Registry SHALL have both a primary model mapping and a fallback model mapping defined.

**Validates: Requirements 2.1, 2.2**

### Property 5: Model Identifier Validation

*For any* model identifier in the Model_Registry, validation against known OpenRouter models SHALL return valid for real model IDs and invalid for malformed IDs.

**Validates: Requirements 2.5**

### Property 6: Location Format Support

*For any* valid location format (city name, coordinates as "lat,lon", or "current location"), the Weather service SHALL accept and process the query without error.

**Validates: Requirements 3.2**

### Property 7: Weather Response Completeness

*For any* successful weather query, the response SHALL contain all required fields: location, temperature, conditions, humidity, and forecast summary.

**Validates: Requirements 3.4**

### Property 8: Timezone Conversion Correctness

*For any* pair of valid timezones, converting a time from timezone A to timezone B and displaying both SHALL produce mathematically correct UTC offsets.

**Validates: Requirements 4.2**

### Property 9: Countdown Calculation Correctness

*For any* future date/time, the countdown calculation SHALL return the correct duration in days, hours, minutes, and seconds.

**Validates: Requirements 4.3**

### Property 10: Date Difference Correctness

*For any* pair of dates, the time difference calculation SHALL return the correct duration between them.

**Validates: Requirements 4.4**

### Property 11: Search Results Structure

*For any* successful web search, the response SHALL contain at most 5 results, each with title, snippet, and URL fields populated.

**Validates: Requirements 5.2**

### Property 12: Search Cache Behavior

*For any* search query, results SHALL be served from cache if queried within 5 minutes of the original request, and SHALL fetch fresh results after cache expiry.

**Validates: Requirements 5.5**

### Property 13: Image Prompt Length Validation

*For any* image generation prompt, prompts up to 500 characters SHALL be accepted, and prompts exceeding 500 characters SHALL be rejected with an appropriate error.

**Validates: Requirements 6.2**

### Property 14: Image Style Support

*For any* supported style modifier (realistic, cartoon, sketch, anime), the Image_Generator SHALL accept and apply the style to the generation request.

**Validates: Requirements 6.6**

### Property 15: Activity Tracking Completeness

*For any* editor activity event, the Activity_Analyzer SHALL update all tracked metrics: files opened count, languages used, time spent, and save frequency.

**Validates: Requirements 7.2**

### Property 16: Coding Pattern Detection

*For any* sequence of editor activities, the Activity_Analyzer SHALL correctly identify patterns including long sessions (>2 hours), frequent saves (>10/hour), and language switches.

**Validates: Requirements 7.5**

### Property 17: Notification Categorization

*For any* notification event, the Notification service SHALL categorize it by app name and assign a priority level (low, medium, high).

**Validates: Requirements 8.2**

### Property 18: Notification Filtering

*For any* notification filter (by app name or time range), the Notification service SHALL return only notifications matching the filter criteria.

**Validates: Requirements 8.5**

### Property 19: Task Serialization Round-Trip

*For any* valid Task object, serializing to JSON and deserializing back SHALL produce an equivalent Task object with all properties preserved.

**Validates: Requirements 9.8**

### Property 20: Task Property Support

*For any* task creation request, the Task_Manager SHALL accept and store all supported properties: title, description, due date, priority, and status.

**Validates: Requirements 9.2**

### Property 21: Task Filtering and Sorting

*For any* task query with filters (status, priority, due date range) and sort order, the Task_Manager SHALL return only matching tasks in the correct order.

**Validates: Requirements 9.3**

### Property 22: Natural Language Date Parsing

*For any* supported natural language date expression ("tomorrow", "next Monday", "in 3 days"), the Task_Manager SHALL parse it to the correct absolute date.

**Validates: Requirements 9.5**

### Property 23: OpenRouter Request Structure

*For any* request to OpenRouter, the request payload SHALL include the model identifier and message array with correct structure.

**Validates: Requirements 10.2**

### Property 24: Rate Limit Backoff

*For any* rate-limited response from OpenRouter, the client SHALL retry with exponential backoff (doubling delay each attempt, starting at 1 second).

**Validates: Requirements 10.3**

### Property 25: Response Emotion Inclusion

*For any* formatted response, the output SHALL include an emotion type derived from the content analysis.

**Validates: Requirements 11.3**

### Property 26: Response Length Constraint

*For any* formatted response for chat bubble display, the text length SHALL not exceed 280 characters (with truncation and "read more" for longer content).

**Validates: Requirements 11.4**

### Property 27: Service Error Messages

*For any* external service failure, the Router SHALL return a user-friendly error message (not raw error details or stack traces).

**Validates: Requirements 12.1**

### Property 28: Circuit Breaker State Transitions

*For any* external service, after N consecutive failures (threshold), the circuit breaker SHALL transition to "open" state and stop sending requests until the reset timeout.

**Validates: Requirements 12.2, 12.3**

### Property 29: Error Recovery Backoff

*For any* service recovering from errors, retry attempts SHALL use exponential backoff with configurable base delay and maximum attempts.

**Validates: Requirements 12.4**

## Error Handling

### Error Categories

| Category | Examples | Handling Strategy |
|----------|----------|-------------------|
| Network Errors | Timeout, DNS failure, connection refused | Retry with backoff, then circuit breaker |
| API Errors | Rate limit, auth failure, invalid request | Log, fallback model, user notification |
| Parse Errors | Invalid JSON, missing fields | Default values, graceful degradation |
| Validation Errors | Invalid input, constraint violation | User-friendly message, input guidance |

### Circuit Breaker Configuration

```typescript
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Open after 5 consecutive failures
  resetTimeout: 30_000,       // Try again after 30 seconds
  halfOpenRequests: 1,        // Allow 1 request in half-open state
  monitorWindow: 60_000,      // Track failures within 1 minute
};
```

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable error code
    message: string;        // User-friendly message
    suggestion?: string;    // What the user can do
    retryable: boolean;     // Whether retry might help
  };
  emotion: 'confused' | 'sad' | 'frustrated';
}
```

### Fallback Chain

```
Primary Model → Fallback Model → Cached Response → Offline Message
```

Each service maintains its own fallback chain:

1. **Weather**: wttr.in → cached weather → "I can't check the weather right now~"
2. **Search**: DuckDuckGo → cached results → "Search is unavailable, try again later~"
3. **Image**: Pollinations → error with retry → "Image generation failed, want to try again?"
4. **Tasks**: Local storage → in-memory → "I'm having trouble with tasks right now~"

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, integration points
- **Property tests**: Verify universal properties across randomized inputs

### Property-Based Testing Configuration

**Library**: fast-check (TypeScript property-based testing library)

**Configuration**:
```typescript
import fc from 'fast-check';

const PBT_CONFIG = {
  numRuns: 100,           // Minimum 100 iterations per property
  seed: Date.now(),       // Reproducible with seed
  verbose: true,          // Log failing examples
};
```

**Tag Format**: Each property test must include a comment referencing the design property:
```typescript
// Feature: multi-model-agentic-routing, Property 1: Intent Classification Correctness
```

### Test Categories

#### Unit Tests

1. **Intent Detection**
   - Specific keyword matching examples
   - Edge cases (empty string, special characters)
   - Confidence threshold boundary (69% vs 71%)

2. **Service Integration**
   - Mock API responses
   - Error response handling
   - Timeout behavior

3. **Task Management**
   - CRUD operations
   - Date parsing edge cases
   - Filter combinations

#### Property Tests

1. **Intent Detector Properties** (Properties 1-3)
   - Generate random messages with known intents
   - Verify classification correctness

2. **Model Registry Properties** (Properties 4-5)
   - Generate task types, verify mappings exist
   - Generate model IDs, verify validation

3. **Time Calculation Properties** (Properties 8-10)
   - Generate timezone pairs, verify conversion
   - Generate date pairs, verify difference

4. **Task Manager Properties** (Properties 19-22)
   - Generate tasks, verify round-trip serialization
   - Generate filters, verify correct results

5. **Response Formatter Properties** (Properties 25-26)
   - Generate responses, verify emotion inclusion
   - Generate long responses, verify truncation

6. **Circuit Breaker Properties** (Properties 28-29)
   - Generate failure sequences, verify state transitions
   - Generate recovery scenarios, verify backoff

### Test File Structure

```
src/
├── renderer/
│   └── services/
│       └── __tests__/
│           ├── intent-detector.test.ts
│           ├── intent-detector.property.test.ts
│           ├── model-registry.test.ts
│           ├── model-registry.property.test.ts
│           ├── router.test.ts
│           ├── router.property.test.ts
│           ├── weather-service.test.ts
│           ├── time-service.test.ts
│           ├── time-service.property.test.ts
│           ├── search-service.test.ts
│           ├── image-service.test.ts
│           ├── task-manager.test.ts
│           ├── task-manager.property.test.ts
│           ├── openrouter-client.test.ts
│           ├── openrouter-client.property.test.ts
│           ├── response-formatter.test.ts
│           ├── response-formatter.property.test.ts
│           └── circuit-breaker.property.test.ts
```

### Mocking Strategy

```typescript
// Mock OpenRouter for deterministic testing
const mockOpenRouter = {
  chat: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Test response' } }]
  })
};

// Mock external APIs
const mockWttr = vi.fn().mockResolvedValue({
  current_condition: [{ temp_C: '20', weatherDesc: [{ value: 'Sunny' }] }]
});

const mockDuckDuckGo = vi.fn().mockResolvedValue({
  RelatedTopics: [{ Text: 'Result 1', FirstURL: 'https://example.com' }]
});
```
