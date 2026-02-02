import fc from 'fast-check';
import type { TaskType, Task, WeatherOutput, SearchResult, NotificationItem } from '../types';

export const taskTypeArb = fc.constantFrom<TaskType>(
  'general_chat',
  'weather',
  'time',
  'web_search',
  'image_generation',
  'ide_activity',
  'notification',
  'task_management'
);

export const priorityArb = fc.constantFrom<Task['priority']>('low', 'medium', 'high');
export const statusArb = fc.constantFrom<Task['status']>('pending', 'in_progress', 'completed');

export const taskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  dueDate: fc.option(fc.date(), { nil: undefined }),
  priority: priorityArb,
  status: statusArb,
  createdAt: fc.date(),
  updatedAt: fc.date(),
  tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }), { nil: undefined }),
});

export const weatherOutputArb: fc.Arbitrary<WeatherOutput> = fc.record({
  location: fc.string({ minLength: 1, maxLength: 100 }),
  temperature: fc.integer({ min: -50, max: 60 }),
  conditions: fc.constantFrom('Sunny', 'Cloudy', 'Rainy', 'Snowy', 'Windy', 'Foggy'),
  humidity: fc.integer({ min: 0, max: 100 }),
  forecast: fc.string({ minLength: 10, maxLength: 200 }),
});

export const searchResultArb: fc.Arbitrary<SearchResult> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  snippet: fc.string({ minLength: 10, maxLength: 300 }),
  url: fc.webUrl(),
});

export const notificationArb: fc.Arbitrary<NotificationItem> = fc.record({
  id: fc.uuid(),
  app: fc.constantFrom('Slack', 'Discord', 'Mail', 'Calendar', 'System'),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  body: fc.string({ maxLength: 500 }),
  priority: priorityArb,
  timestamp: fc.date(),
});

export const timezoneArb = fc.constantFrom(
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Jakarta',
  'Australia/Sydney',
  'UTC'
);

export const locationArb = fc.oneof(
  fc.string({ minLength: 2, maxLength: 50 }),
  fc.tuple(fc.double({ min: -90, max: 90 }), fc.double({ min: -180, max: 180 }))
    .map(([lat, lon]) => `${lat.toFixed(4)},${lon.toFixed(4)}`),
  fc.constant('current location')
);

export const imageStyleArb = fc.constantFrom<'realistic' | 'cartoon' | 'sketch' | 'anime'>(
  'realistic', 'cartoon', 'sketch', 'anime'
);

export const modelIdArb = fc.oneof(
  fc.constant('mistralai/mistral-7b-instruct:free'),
  fc.constant('meta-llama/llama-3.3-70b-instruct:free'),
  fc.constant('google/gemini-2.0-flash-exp:free'),
  fc.constant('mistralai/devstral-2:free'),
  fc.constant('mistralai/mistral-small-3.1-24b-instruct:free'),
  fc.constant('anthropic/claude-haiku-4-5-20251001')
);

export const invalidModelIdArb = fc.oneof(
  fc.constant(''),
  fc.constant('invalid'),
  fc.constant('/onlymodel'),
  fc.constant('onlyprovider/'),
  fc.constant('//'),
  fc.constant('/'),
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => !s.includes('/'))
);

export const weatherKeywordMessageArb = fc.tuple(
  fc.constantFrom('weather', 'temperature', 'forecast', 'rain', 'sunny'),
  fc.string({ maxLength: 50 })
).map(([keyword, suffix]) => `What's the ${keyword} ${suffix}`.trim());

export const timeKeywordMessageArb = fc.tuple(
  fc.constantFrom('time', 'clock', 'timezone'),
  fc.string({ maxLength: 50 })
).map(([keyword, suffix]) => `What ${keyword} is it ${suffix}`.trim());

export const searchKeywordMessageArb = fc.tuple(
  fc.constantFrom('search', 'find', 'look up', 'what is'),
  fc.string({ minLength: 1, maxLength: 50 })
).map(([keyword, query]) => `${keyword} ${query}`.trim());

export const imageKeywordMessageArb = fc.tuple(
  fc.constantFrom('generate', 'create', 'draw'),
  fc.constantFrom('image', 'picture', 'art'),
  fc.string({ minLength: 1, maxLength: 50 })
).map(([action, type, desc]) => `${action} an ${type} of ${desc}`.trim());

export const taskKeywordMessageArb = fc.tuple(
  fc.constantFrom('add', 'create', 'show', 'list'),
  fc.constantFrom('task', 'todo', 'reminder'),
  fc.string({ maxLength: 50 })
).map(([action, type, desc]) => `${action} ${type} ${desc}`.trim());

export const ambiguousMessageArb = fc.string({ minLength: 5, maxLength: 100 })
  .filter(s => !['weather', 'time', 'search', 'image', 'task', 'notification', 'coding'].some(k => s.toLowerCase().includes(k)));
