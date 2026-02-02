# Implementation Plan: Multi-Model Agentic Routing

## Overview

This implementation plan breaks down the multi-model agentic routing feature into discrete coding tasks. The approach is bottom-up: starting with core utilities and data models, then building services, and finally wiring everything together with the router.

## Tasks

- [x] 1. Set up project infrastructure and core types
  - [x] 1.1 Create routing module directory structure
    - Create `src/renderer/services/routing/` directory
    - Create `src/renderer/services/routing/types.ts` for shared types
    - Create `src/renderer/services/routing/constants.ts` for configuration
    - _Requirements: 2.1, 2.3_
  
  - [x] 1.2 Define core TypeScript types and interfaces
    - Define `TaskType` union type for all 8 task categories
    - Define `IntentResult`, `ModelConfig`, `RouterResult` interfaces
    - Define service input/output interfaces for each service
    - _Requirements: 1.1, 2.1_
  
  - [x] 1.3 Set up fast-check testing infrastructure
    - Install fast-check: `npm install -D fast-check`
    - Create test utilities and generators in `__tests__/generators.ts`
    - _Requirements: Testing Strategy_

- [x] 2. Implement Intent Detector
  - [x] 2.1 Create Intent Detector with keyword/pattern matching
    - Implement `IntentDetector` class in `src/renderer/services/routing/intent-detector.ts`
    - Add weighted keyword matching algorithm
    - Add regex pattern matching for each task type
    - Calculate confidence scores based on match strength
    - _Requirements: 1.1, 1.4_
  
  - [x] 2.2 Write property test for intent classification
    - **Property 1: Intent Classification Correctness**
    - **Validates: Requirements 1.1**
  
  - [x] 2.3 Write property test for low confidence fallback
    - **Property 2: Low Confidence Fallback**
    - **Validates: Requirements 1.2**
  
  - [x] 2.4 Write property test for multi-intent ordering
    - **Property 3: Multi-Intent Ordering**
    - **Validates: Requirements 1.3**

- [x] 3. Implement Model Registry
  - [x] 3.1 Create Model Registry with default configurations
    - Implement `ModelRegistry` class in `src/renderer/services/routing/model-registry.ts`
    - Define default model mappings for all 8 task types
    - Implement fallback model lookup
    - Support environment variable overrides
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 3.2 Write property test for model registry completeness
    - **Property 4: Model Registry Completeness**
    - **Validates: Requirements 2.1, 2.2**
  
  - [x] 3.3 Write property test for model identifier validation
    - **Property 5: Model Identifier Validation**
    - **Validates: Requirements 2.5**

- [x] 4. Checkpoint - Core routing infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement OpenRouter Client
  - [x] 5.1 Create OpenRouter HTTP client
    - Implement `OpenRouterClient` class in `src/renderer/services/routing/openrouter-client.ts`
    - Add authentication via OpenClaw gateway
    - Implement chat completion method
    - Add streaming response support
    - Implement 30-second timeout
    - _Requirements: 10.1, 10.2, 10.5, 10.6_
  
  - [x] 5.2 Add rate limiting and retry logic
    - Implement exponential backoff for rate limits
    - Add fallback model switching on errors
    - Add request/response logging
    - _Requirements: 10.3, 10.4, 10.7_
  
  - [x] 5.3 Write property test for request structure
    - **Property 23: OpenRouter Request Structure**
    - **Validates: Requirements 10.2**
  
  - [x] 5.4 Write property test for rate limit backoff
    - **Property 24: Rate Limit Backoff**
    - **Validates: Requirements 10.3**

- [x] 6. Implement Circuit Breaker
  - [x] 6.1 Create Circuit Breaker utility
    - Implement `CircuitBreaker` class in `src/renderer/services/routing/circuit-breaker.ts`
    - Add state management (closed, open, half-open)
    - Implement failure counting and threshold detection
    - Add reset timeout and recovery logic
    - _Requirements: 12.2, 12.3, 12.4_
  
  - [x] 6.2 Write property test for circuit breaker state transitions
    - **Property 28: Circuit Breaker State Transitions**
    - **Validates: Requirements 12.2, 12.3**
  
  - [x] 6.3 Write property test for error recovery backoff
    - **Property 29: Error Recovery Backoff**
    - **Validates: Requirements 12.4**

- [ ] 7. Implement Weather Service
  - [ ] 7.1 Create Weather Service with wttr.in integration
    - Implement `WeatherService` class in `src/renderer/services/routing/services/weather.ts`
    - Add wttr.in API client
    - Support city name, coordinates, and IP-based location
    - Parse and structure weather response
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ] 7.2 Write property test for location format support
    - **Property 6: Location Format Support**
    - **Validates: Requirements 3.2**
  
  - [ ] 7.3 Write property test for weather response completeness
    - **Property 7: Weather Response Completeness**
    - **Validates: Requirements 3.4**

- [ ] 8. Implement Time Service
  - [ ] 8.1 Create Time Service with timezone and calculation support
    - Implement `TimeService` class in `src/renderer/services/routing/services/time.ts`
    - Add current time retrieval
    - Implement timezone conversion
    - Add countdown and date difference calculations
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 8.2 Write property test for timezone conversion
    - **Property 8: Timezone Conversion Correctness**
    - **Validates: Requirements 4.2**
  
  - [ ] 8.3 Write property test for countdown calculation
    - **Property 9: Countdown Calculation Correctness**
    - **Validates: Requirements 4.3**
  
  - [ ] 8.4 Write property test for date difference
    - **Property 10: Date Difference Correctness**
    - **Validates: Requirements 4.4**

- [ ] 9. Checkpoint - Service implementations (Weather, Time)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement Web Search Service
  - [ ] 10.1 Create Web Search Service with DuckDuckGo integration
    - Implement `SearchService` class in `src/renderer/services/routing/services/search.ts`
    - Add DuckDuckGo Instant Answer API client
    - Parse and structure search results (max 5)
    - Implement 5-minute result caching
    - _Requirements: 5.1, 5.2, 5.5_
  
  - [ ] 10.2 Write property test for search results structure
    - **Property 11: Search Results Structure**
    - **Validates: Requirements 5.2**
  
  - [ ] 10.3 Write property test for search cache behavior
    - **Property 12: Search Cache Behavior**
    - **Validates: Requirements 5.5**

- [ ] 11. Implement Image Generation Service
  - [ ] 11.1 Create Image Service with Pollinations.ai integration
    - Implement `ImageService` class in `src/renderer/services/routing/services/image.ts`
    - Add Pollinations.ai API client
    - Implement prompt length validation (500 char limit)
    - Support style modifiers (realistic, cartoon, sketch, anime)
    - _Requirements: 6.1, 6.2, 6.6_
  
  - [ ] 11.2 Write property test for prompt length validation
    - **Property 13: Image Prompt Length Validation**
    - **Validates: Requirements 6.2**
  
  - [ ] 11.3 Write property test for style support
    - **Property 14: Image Style Support**
    - **Validates: Requirements 6.6**

- [ ] 12. Implement Task Manager
  - [ ] 12.1 Create Task Manager with local JSON storage
    - Implement `TaskManager` class in `src/renderer/services/routing/services/tasks.ts`
    - Add CRUD operations for tasks
    - Implement JSON serialization/deserialization
    - Add filtering and sorting support
    - _Requirements: 9.1, 9.2, 9.3, 9.7_
  
  - [ ] 12.2 Add natural language date parsing
    - Implement date parser for "tomorrow", "next Monday", etc.
    - Add due date reminder detection (within 1 hour)
    - _Requirements: 9.5, 9.6_
  
  - [ ] 12.3 Write property test for task serialization round-trip
    - **Property 19: Task Serialization Round-Trip**
    - **Validates: Requirements 9.8**
  
  - [ ] 12.4 Write property test for task property support
    - **Property 20: Task Property Support**
    - **Validates: Requirements 9.2**
  
  - [ ] 12.5 Write property test for task filtering and sorting
    - **Property 21: Task Filtering and Sorting**
    - **Validates: Requirements 9.3**
  
  - [ ] 12.6 Write property test for natural language date parsing
    - **Property 22: Natural Language Date Parsing**
    - **Validates: Requirements 9.5**

- [ ] 13. Checkpoint - Service implementations (Search, Image, Tasks)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement Activity Analyzer
  - [ ] 14.1 Create Activity Analyzer for IDE events
    - Implement `ActivityAnalyzer` class in `src/renderer/services/routing/services/activity.ts`
    - Integrate with existing editor-watcher events
    - Track files opened, languages, time spent, save frequency
    - Detect coding patterns (long sessions, frequent saves)
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [ ] 14.2 Write property test for activity tracking completeness
    - **Property 15: Activity Tracking Completeness**
    - **Validates: Requirements 7.2**
  
  - [ ] 14.3 Write property test for coding pattern detection
    - **Property 16: Coding Pattern Detection**
    - **Validates: Requirements 7.5**

- [ ] 15. Implement Notification Service
  - [ ] 15.1 Create Notification Service for system notifications
    - Implement `NotificationService` class in `src/renderer/services/routing/services/notifications.ts`
    - Integrate with existing notification-watcher events
    - Add categorization by app and priority
    - Implement filtering by app name and time range
    - _Requirements: 8.1, 8.2, 8.5_
  
  - [ ] 15.2 Write property test for notification categorization
    - **Property 17: Notification Categorization**
    - **Validates: Requirements 8.2**
  
  - [ ] 15.3 Write property test for notification filtering
    - **Property 18: Notification Filtering**
    - **Validates: Requirements 8.5**

- [ ] 16. Implement Response Formatter
  - [ ] 16.1 Create Response Formatter with Doraemon persona
    - Implement `ResponseFormatter` class in `src/renderer/services/routing/response-formatter.ts`
    - Add emotion detection from content
    - Implement 280-character truncation with "read more"
    - Apply Doraemon personality markers
    - _Requirements: 11.1, 11.3, 11.4, 11.5_
  
  - [ ] 16.2 Write property test for emotion inclusion
    - **Property 25: Response Emotion Inclusion**
    - **Validates: Requirements 11.3**
  
  - [ ] 16.3 Write property test for response length constraint
    - **Property 26: Response Length Constraint**
    - **Validates: Requirements 11.4**

- [ ] 17. Checkpoint - All services implemented
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Implement Main Router
  - [ ] 18.1 Create Router service to orchestrate all components
    - Implement `Router` class in `src/renderer/services/routing/router.ts`
    - Wire Intent Detector, Model Registry, and all services
    - Implement request dispatching based on intent
    - Add error handling with user-friendly messages
    - _Requirements: 1.2, 1.3, 1.5, 12.1_
  
  - [ ] 18.2 Write property test for service error messages
    - **Property 27: Service Error Messages**
    - **Validates: Requirements 12.1**

- [ ] 19. Create React hooks for routing
  - [ ] 19.1 Create useRouter hook
    - Implement `useRouter` hook in `src/renderer/hooks/useRouter.ts`
    - Expose route method for sending messages
    - Manage loading and error states
    - _Requirements: 1.1_
  
  - [ ] 19.2 Create useTaskManager hook
    - Implement `useTaskManager` hook in `src/renderer/hooks/useTaskManager.ts`
    - Expose CRUD operations for tasks
    - Handle task reminders
    - _Requirements: 9.1, 9.6_

- [ ] 20. Integrate with existing chat interface
  - [ ] 20.1 Update useOpenClaw hook to use Router
    - Modify `src/renderer/hooks/useOpenClaw.ts` to route through Router
    - Preserve existing WebSocket connection for general chat
    - Add model metadata to responses
    - _Requirements: 1.1, 11.1_
  
  - [ ] 20.2 Update ChatBubble to display service-specific content
    - Modify `src/renderer/ui/components/mascot/ChatBubble.tsx`
    - Add image display support for image generation
    - Add "read more" expansion for long responses
    - _Requirements: 6.3, 11.5_

- [ ] 21. Add configuration and environment support
  - [ ] 21.1 Update environment configuration
    - Add OpenRouter API configuration to `.env.example`
    - Add model override environment variables
    - Document configuration options
    - _Requirements: 2.4, 10.1_

- [ ] 22. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all services route correctly
  - Test error handling and fallbacks

## Notes

- All tasks are required including property-based tests for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The implementation follows a bottom-up approach: types → utilities → services → router → hooks → UI
