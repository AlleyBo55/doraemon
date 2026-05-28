import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { BrowserWindow } from 'electron';
import { DORAEMON_TOOLS, CODING_STATUS_EMOTION_MAP } from './tools.js';

export type MCPRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type MCPResponse = {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
};

let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;
let mainWindow: BrowserWindow | null = null;
let connectedClients: Set<WebSocket> = new Set();
let serverPort: number = 18790;

const PING_INTERVAL_MS = 30_000;
let pingInterval: ReturnType<typeof setInterval> | null = null;

function handleToolCall(
  toolName: string,
  params: Record<string, unknown>
): { success: boolean; result?: unknown; error?: string } {
  console.log(`[MCP] Tool call: ${toolName}`, params);
  
  switch (toolName) {
    case 'doraemon_notify':
      mainWindow?.webContents.send('mcp-notify', {
        message: params.message,
        emotion: params.emotion || 'happy',
        duration: params.duration || 5000,
      });
      return { success: true, result: 'Notification sent to Doraemon' };
      
    case 'doraemon_emotion':
      mainWindow?.webContents.send('trigger-emotion', params.emotion);
      return { success: true, result: `Triggered emotion: ${params.emotion}` };
      
    case 'doraemon_ask':
      return { success: true, result: 'Doraemon is thinking about your question...' };
      
    case 'doraemon_coding_status':
      mainWindow?.webContents.send('trigger-emotion', CODING_STATUS_EMOTION_MAP[params.action as string] || 'action_coding_typing');
      if (params.message) {
        mainWindow?.webContents.send('mcp-notify', {
          message: params.message,
          emotion: CODING_STATUS_EMOTION_MAP[params.action as string] || 'action_coding_typing',
          duration: 4000,
        });
      }
      return { success: true, result: `Coding status updated: ${params.action}` };
      
    case 'doraemon_celebrate':
      mainWindow?.webContents.send('trigger-emotion', 'emotion_pride');
      mainWindow?.webContents.send('mcp-notify', {
        message: `🎉 ${params.reason}`,
        emotion: 'pride',
        duration: 6000,
      });
      return { success: true, result: 'Doraemon is celebrating!' };
      
    case 'doraemon_remember':
      mainWindow?.webContents.send('memory-learn', {
        content: params.content,
        category: params.category,
        source: 'mcp',
      });
      return { success: true, result: 'Stored in Doraemon\'s memory' };
      
    case 'doraemon_recall':
      return { success: true, result: 'Memory recall requested' };
      
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

function handleMCPRequest(request: MCPRequest): MCPResponse {
  const { id, method, params } = request;
  
  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'doraemon-mcp',
            version: '1.0.0',
          },
        },
      };
      
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: DORAEMON_TOOLS },
      };
      
    case 'tools/call':
      const toolName = (params as { name: string })?.name;
      const toolParams = (params as { arguments?: Record<string, unknown> })?.arguments || {};
      const result = handleToolCall(toolName, toolParams);
      
      if (result.success) {
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: String(result.result) }] },
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: result.error || 'Tool call failed' },
        };
      }
      
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

export function startMCPServer(window: BrowserWindow, port: number = 18790): void {
  mainWindow = window;
  
  httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', clients: connectedClients.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  
  wss = new WebSocketServer({ server: httpServer });
  
  wss.on('connection', (ws) => {
    console.log('[MCP] Client connected');
    connectedClients.add(ws);
    (ws as any).isAlive = true;
    
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
    
    ws.on('message', (data) => {
      try {
        const request = JSON.parse(data.toString()) as MCPRequest;
        const response = handleMCPRequest(request);
        ws.send(JSON.stringify(response));
      } catch (err) {
        console.error('[MCP] Error handling message:', err);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }));
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`[MCP] Client disconnected (code: ${code}, reason: ${reason.toString() || 'none'})`);
      connectedClients.delete(ws);
    });
    
    ws.on('error', (err) => {
      console.error('[MCP] WebSocket error:', err);
      connectedClients.delete(ws);
    });
  });
  
  pingInterval = setInterval(() => {
    if (!wss) return;
    for (const ws of connectedClients) {
      if (!(ws as any).isAlive) {
        console.log('[MCP] Client unresponsive, terminating');
        connectedClients.delete(ws);
        ws.terminate();
        continue;
      }
      (ws as any).isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL_MS);
  
  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`[MCP] Doraemon MCP server running on ws://127.0.0.1:${port}`);
  });
}

export function stopMCPServer(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  for (const client of connectedClients) {
    client.close();
  }
  connectedClients.clear();
  
  wss?.close();
  httpServer?.close();
  wss = null;
  httpServer = null;
  
  console.log('[MCP] Server stopped');
}

export function broadcastToClients(message: Record<string, unknown>): void {
  const data = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function getConnectedClientsCount(): number {
  return connectedClients.size;
}
