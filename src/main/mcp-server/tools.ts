export type MCPToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

export const DORAEMON_TOOLS: MCPToolDefinition[] = [
  {
    name: 'doraemon_notify',
    description: 'Send a notification to Doraemon to display in a speech bubble',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to display in speech bubble' },
        emotion: { type: 'string', description: 'Emotion: happy, excited, thinking, sad, confused, proud' },
        duration: { type: 'number', description: 'Duration in ms (default: 5000)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'doraemon_emotion',
    description: 'Trigger a specific emotion/animation on Doraemon',
    inputSchema: {
      type: 'object',
      properties: {
        emotion: { type: 'string', description: 'Emotion: happy, sad, excited, thinking, coding, coding_intense, coding_celebrate, sleepy, confused, proud, curious, playful' },
        intensity: { type: 'number', description: 'Intensity 0-1 (default: 0.8)' },
      },
      required: ['emotion'],
    },
  },
  {
    name: 'doraemon_ask',
    description: "Ask Doraemon a question and get a response from its memory/personality",
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question to ask Doraemon' },
      },
      required: ['question'],
    },
  },
  {
    name: 'doraemon_coding_status',
    description: 'Update Doraemon about coding activity',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: started, completed, error, thinking, reviewing' },
        file: { type: 'string', description: 'File being worked on' },
        language: { type: 'string', description: 'Programming language' },
        message: { type: 'string', description: 'Status message to show' },
      },
      required: ['action'],
    },
  },
  {
    name: 'doraemon_celebrate',
    description: 'Make Doraemon celebrate an achievement',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'What to celebrate' },
        intensity: { type: 'string', description: 'small, medium, or big (default: medium)' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'doraemon_remember',
    description: "Store something in Doraemon's memory for later recall",
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember' },
        category: { type: 'string', description: 'Category: preference, fact, correction, project, conversation' },
      },
      required: ['content', 'category'],
    },
  },
  {
    name: 'doraemon_recall',
    description: 'Ask Doraemon to recall something from memory',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall' },
      },
      required: ['query'],
    },
  },
  {
    name: 'doraemon_status',
    description: "Get Doraemon's current status (emotion, online status, memory count)",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const CODING_STATUS_EMOTION_MAP: Record<string, string> = {
  started: 'coding',
  completed: 'coding_celebrate',
  error: 'frustrated',
  thinking: 'coding_thinking',
  reviewing: 'thinking',
};
