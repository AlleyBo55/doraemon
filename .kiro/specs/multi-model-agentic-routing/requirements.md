# Requirements Document

## Introduction

This document specifies the requirements for adding multi-model agentic routing to the Doraemon desktop mascot application. The feature enables intelligent routing of different tasks to specialized free AI models via OpenRouter, while maintaining Claude Haiku 4.5 as the primary conversational model. This creates a more capable and cost-effective AI companion that can perform weather lookups, web searches, image generation, IDE activity analysis, system notifications, and task management.

## Glossary

- **Router**: The component that analyzes user intent and routes requests to the appropriate model/service
- **Intent_Detector**: The subsystem that classifies user messages into task categories
- **Model_Registry**: Configuration store mapping task types to specific AI models
- **Service_Executor**: Component that executes external API calls (weather, search, image generation)
- **Task_Manager**: Local storage-based system for managing user tasks and reminders
- **OpenRouter_Client**: HTTP client for communicating with OpenRouter API
- **OpenClaw_Gateway**: The existing WebSocket gateway for AI communication
- **Activity_Analyzer**: Component that processes IDE activity events and generates insights

## Requirements

### Requirement 1: Intent Detection and Routing

**User Story:** As a user, I want Doraemon to automatically understand what I'm asking for and route my request to the best AI model, so that I get optimal responses without manually selecting models.

#### Acceptance Criteria

1. WHEN a user sends a message, THE Intent_Detector SHALL classify it into one of the following categories: general_chat, weather, time, web_search, image_generation, ide_activity, notification, or task_management
2. WHEN intent classification confidence is below 70%, THE Router SHALL default to the general_chat model (Claude Haiku 4.5)
3. WHEN a message contains multiple intents, THE Router SHALL process the primary intent first and queue secondary intents
4. THE Intent_Detector SHALL complete classification within 100ms to maintain responsive UX
5. IF intent detection fails, THEN THE Router SHALL gracefully fallback to Claude Haiku 4.5 and log the error

### Requirement 2: Model Registry Configuration

**User Story:** As a developer, I want a centralized configuration for model assignments, so that I can easily update model mappings without code changes.

#### Acceptance Criteria

1. THE Model_Registry SHALL store mappings between task types and OpenRouter model identifiers
2. WHEN a model is unavailable, THE Model_Registry SHALL provide a fallback model for each task type
3. THE Model_Registry SHALL support the following model assignments:
   - general_chat: anthropic/claude-3-5-haiku (via Anthropic)
   - weather: mistralai/mistral-7b-instruct:free
   - time: mistralai/mistral-7b-instruct:free
   - web_search: meta-llama/llama-3.3-70b-instruct:free
   - image_generation: google/gemini-2.0-flash-exp:free
   - ide_activity: mistralai/devstral-2:free
   - notification: mistralai/mistral-small-3.1-24b-instruct:free
   - task_management: meta-llama/llama-3.3-70b-instruct:free
4. THE Model_Registry SHALL be configurable via environment variables or JSON configuration file
5. THE Model_Registry SHALL validate model identifiers against known OpenRouter models on startup

### Requirement 3: Weather Service Integration

**User Story:** As a user, I want to ask Doraemon about the weather, so that I can get current conditions and forecasts without leaving my desktop.

#### Acceptance Criteria

1. WHEN a user asks about weather, THE Service_Executor SHALL fetch data from wttr.in API
2. THE Service_Executor SHALL support location-based queries (city name, coordinates, or "current location")
3. WHEN location is not specified, THE Service_Executor SHALL use IP-based geolocation
4. THE Weather service SHALL return temperature, conditions, humidity, and forecast summary
5. IF the wttr.in API is unavailable, THEN THE Service_Executor SHALL return a friendly error message
6. THE Weather response SHALL be formatted by Mistral 7B into Doraemon's conversational style

### Requirement 4: Time Utilities

**User Story:** As a user, I want to ask Doraemon about time-related queries, so that I can get timezone conversions, countdowns, and time calculations.

#### Acceptance Criteria

1. WHEN a user asks about current time, THE Service_Executor SHALL return the local system time
2. WHEN a user asks about time in another timezone, THE Service_Executor SHALL convert and display both times
3. THE Time service SHALL support countdown calculations ("how long until X")
4. THE Time service SHALL support time difference calculations between dates
5. THE Time response SHALL be formatted by Mistral 7B into Doraemon's conversational style

### Requirement 5: Web Search Integration

**User Story:** As a user, I want Doraemon to search the web for me, so that I can get information without switching to a browser.

#### Acceptance Criteria

1. WHEN a user requests a web search, THE Service_Executor SHALL query DuckDuckGo Instant Answer API
2. THE Web_Search service SHALL return top 5 relevant results with titles, snippets, and URLs
3. WHEN DuckDuckGo returns no results, THE Service_Executor SHALL attempt a fallback search
4. THE Search results SHALL be summarized by Llama 3.3 70B into a concise answer
5. THE Service_Executor SHALL cache search results for 5 minutes to reduce API calls
6. IF web search fails, THEN THE Service_Executor SHALL inform the user and suggest alternative queries

### Requirement 6: Image Generation

**User Story:** As a user, I want Doraemon to generate images from my descriptions, so that I can quickly create visual content.

#### Acceptance Criteria

1. WHEN a user requests image generation, THE Service_Executor SHALL call Pollinations.ai API
2. THE Image_Generator SHALL accept text prompts up to 500 characters
3. WHEN image generation completes, THE Service_Executor SHALL display the image in the chat bubble
4. THE Image prompt SHALL be enhanced by Gemini 2.0 Flash before sending to Pollinations
5. IF image generation fails, THEN THE Service_Executor SHALL return an error with retry option
6. THE Image_Generator SHALL support basic style modifiers (realistic, cartoon, sketch, etc.)

### Requirement 7: IDE Activity Analysis

**User Story:** As a developer, I want Doraemon to understand my coding activity, so that he can provide contextual assistance and encouragement.

#### Acceptance Criteria

1. WHEN the editor-watcher detects file activity, THE Activity_Analyzer SHALL process the event
2. THE Activity_Analyzer SHALL track: files opened, languages used, time spent coding, and save frequency
3. WHEN a user asks about their coding activity, THE Activity_Analyzer SHALL provide a summary
4. THE Activity summary SHALL be generated by Devstral 2 with coding-specific insights
5. THE Activity_Analyzer SHALL detect coding patterns (long sessions, frequent saves, language switches)
6. WHEN detecting extended coding sessions (>2 hours), THE Activity_Analyzer SHALL suggest breaks

### Requirement 8: System Notifications

**User Story:** As a user, I want Doraemon to help me manage and respond to system notifications, so that I stay informed without context switching.

#### Acceptance Criteria

1. WHEN the notification-watcher detects a notification, THE Router SHALL process it for relevance
2. THE Notification service SHALL categorize notifications by app and priority
3. WHEN a user asks about recent notifications, THE Service_Executor SHALL provide a summary
4. THE Notification summary SHALL be generated by Mistral Small 3.1 24B
5. THE Notification service SHALL support filtering by app name or time range
6. IF notification access is unavailable, THEN THE Service_Executor SHALL inform the user about permissions

### Requirement 9: Task Management

**User Story:** As a user, I want Doraemon to help me manage tasks and reminders, so that I can stay organized while working.

#### Acceptance Criteria

1. WHEN a user creates a task, THE Task_Manager SHALL store it in local JSON storage
2. THE Task_Manager SHALL support task properties: title, description, due date, priority, and status
3. WHEN a user asks about tasks, THE Task_Manager SHALL return filtered and sorted results
4. THE Task list SHALL be formatted by Llama 3.3 70B with priority-based recommendations
5. THE Task_Manager SHALL support natural language due dates ("tomorrow", "next Monday")
6. WHEN a task is due within 1 hour, THE Task_Manager SHALL proactively remind the user
7. THE Task_Manager SHALL persist data across application restarts
8. THE Task_Manager SHALL serialize tasks to JSON and deserialize on load (round-trip property)

### Requirement 10: OpenRouter Client Integration

**User Story:** As a developer, I want a robust OpenRouter client, so that I can reliably communicate with free models.

#### Acceptance Criteria

1. THE OpenRouter_Client SHALL authenticate using the OpenClaw gateway's OpenRouter provider
2. WHEN sending a request, THE OpenRouter_Client SHALL include model identifier and message payload
3. THE OpenRouter_Client SHALL handle rate limiting with exponential backoff
4. IF a model returns an error, THEN THE OpenRouter_Client SHALL attempt the fallback model
5. THE OpenRouter_Client SHALL support streaming responses for real-time display
6. THE OpenRouter_Client SHALL timeout requests after 30 seconds
7. THE OpenRouter_Client SHALL log all requests and responses for debugging

### Requirement 11: Response Formatting

**User Story:** As a user, I want all responses to feel like they're coming from Doraemon, so that the experience remains consistent and charming.

#### Acceptance Criteria

1. THE Router SHALL apply Doraemon persona formatting to all model responses
2. WHEN formatting responses, THE Router SHALL preserve factual accuracy while adding personality
3. THE Response formatter SHALL include appropriate emotions based on content
4. THE Response formatter SHALL keep responses concise (under 280 characters for chat bubbles)
5. WHEN responses exceed length limits, THE Router SHALL provide a "read more" expansion option

### Requirement 12: Error Handling and Resilience

**User Story:** As a user, I want Doraemon to handle errors gracefully, so that my experience isn't disrupted by technical issues.

#### Acceptance Criteria

1. IF any external service fails, THEN THE Router SHALL provide a user-friendly error message
2. WHEN multiple consecutive failures occur, THE Router SHALL switch to offline mode
3. THE Router SHALL maintain a circuit breaker for each external service
4. WHEN recovering from errors, THE Router SHALL automatically retry with exponential backoff
5. THE Error handler SHALL log all errors with context for debugging
6. IF all models are unavailable, THEN THE Router SHALL use cached responses or offline fallbacks
