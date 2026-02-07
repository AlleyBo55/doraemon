#!/usr/bin/env node

/**
 * Doraemon MCP Server
 * 
 * This MCP server allows IDEs (Kiro, Antigravity, Cursor, Claude Desktop) to:
 * 1. Send notifications to Doraemon
 * 2. Trigger emotions/animations
 * 3. Store/recall memories
 * 4. Get workspace context
 * 
 * Usage in mcp.json:
 * {
 *   "mcpServers": {
 *     "doraemon": {
 *       "command": "node",
 *       "args": ["path/to/doraemon-mcp.js", "--workspace", "/path/to/project"]
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DORAEMON_TOOLS, CODING_STATUS_EMOTION_MAP } from './tools.js';

const DORAEMON_DIR = '.doraemon';
const COMMAND_FILE = 'command.json';
const STATE_FILE = 'state.json';

type DoraemonCommand = {
  id: string;
  type: 'notify' | 'emotion' | 'remember' | 'recall' | 'coding_status' | 'celebrate';
  params: Record<string, unknown>;
  timestamp: number;
};

type DoraemonState = {
  emotion: string;
  lastActivity: string;
  isOnline: boolean;
  memories: number;
};

let workspacePath = process.cwd();

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && args[i + 1]) {
    workspacePath = args[i + 1];
  }
}

async function ensureDoraemonDir(): Promise<string> {
  const doraemonPath = path.join(workspacePath, DORAEMON_DIR);
  await fs.mkdir(doraemonPath, { recursive: true });
  return doraemonPath;
}

async function sendCommand(command: Omit<DoraemonCommand, 'id' | 'timestamp'>): Promise<void> {
  const doraemonPath = await ensureDoraemonDir();
  const fullCommand: DoraemonCommand = {
    ...command,
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  await fs.writeFile(
    path.join(doraemonPath, COMMAND_FILE),
    JSON.stringify(fullCommand, null, 2)
  );
}

async function getDoraemonState(): Promise<DoraemonState> {
  try {
    const doraemonPath = path.join(workspacePath, DORAEMON_DIR);
    const content = await fs.readFile(path.join(doraemonPath, STATE_FILE), 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[Doraemon MCP] Failed to read state:', err);
    return {
      emotion: 'neutral',
      lastActivity: 'unknown',
      isOnline: false,
      memories: 0,
    };
  }
}

async function getWorkspaceFiles(dir: string, depth = 2): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string, currentDepth: number) {
    if (currentDepth > depth) return;
    
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(workspacePath, fullPath);
        
        if (entry.isDirectory()) {
          files.push(relativePath + '/');
          await walk(fullPath, currentDepth + 1);
        } else {
          files.push(relativePath);
        }
      }
    } catch (err) {
      console.error('[Doraemon MCP] Failed to walk directory:', err);
    }
  }
  
  await walk(dir, 0);
  return files;
}

const server = new Server(
  {
    name: 'doraemon-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: DORAEMON_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'doraemon_notify':
      await sendCommand({
        type: 'notify',
        params: {
          message: args?.message,
          emotion: args?.emotion || 'happy',
          duration: args?.duration || 5000,
        },
      });
      return { content: [{ type: 'text', text: `✅ Notification sent to Doraemon: "${args?.message}"` }] };
      
    case 'doraemon_emotion':
      await sendCommand({
        type: 'emotion',
        params: { emotion: args?.emotion },
      });
      return { content: [{ type: 'text', text: `✅ Triggered emotion: ${args?.emotion}` }] };
      
    case 'doraemon_coding_status':
      await sendCommand({
        type: 'coding_status',
        params: {
          action: args?.action,
          file: args?.file,
          language: args?.language,
          message: args?.message,
        },
      });
      return { content: [{ type: 'text', text: `✅ Coding status updated: ${args?.action}` }] };
      
    case 'doraemon_celebrate':
      await sendCommand({
        type: 'celebrate',
        params: { reason: args?.reason },
      });
      return { content: [{ type: 'text', text: `🎉 Doraemon is celebrating: ${args?.reason}` }] };
      
    case 'doraemon_remember':
      await sendCommand({
        type: 'remember',
        params: {
          content: args?.content,
          category: args?.category,
        },
      });
      return { content: [{ type: 'text', text: `✅ Stored in Doraemon's memory: "${args?.content}"` }] };
      
    case 'doraemon_recall':
      await sendCommand({
        type: 'recall',
        params: { query: args?.query },
      });
      return { content: [{ type: 'text', text: `🔍 Doraemon is searching memory for: "${args?.query}"` }] };
      
    case 'doraemon_status':
      const state = await getDoraemonState();
      return {
        content: [{
          type: 'text',
          text: `🐱 Doraemon Status:\n- Emotion: ${state.emotion}\n- Online: ${state.isOnline}\n- Last Activity: ${state.lastActivity}\n- Memories: ${state.memories}`,
        }],
      };
      
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'doraemon://workspace/files',
      name: 'Workspace Files',
      description: 'List of files in the current workspace',
      mimeType: 'application/json',
    },
    {
      uri: 'doraemon://workspace/structure',
      name: 'Project Structure',
      description: 'Project structure overview',
      mimeType: 'text/plain',
    },
    {
      uri: 'doraemon://status',
      name: 'Doraemon Status',
      description: 'Current Doraemon status and state',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  switch (uri) {
    case 'doraemon://workspace/files':
      const files = await getWorkspaceFiles(workspacePath);
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(files, null, 2),
        }],
      };
      
    case 'doraemon://workspace/structure':
      const structure = await getWorkspaceFiles(workspacePath, 3);
      const tree = structure.map(f => f.endsWith('/') ? `📁 ${f}` : `📄 ${f}`).join('\n');
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: `Workspace: ${workspacePath}\n\n${tree}`,
        }],
      };
      
    case 'doraemon://status':
      const state = await getDoraemonState();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(state, null, 2),
        }],
      };
      
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Doraemon MCP] Server started for workspace:', workspacePath);
}

main().catch(console.error);
