import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const DORAEMON_DIR = path.join(WORKSPACE_ROOT, '.doraemon');

type KiroRequest = {
  id: string;
  type: 'chat' | 'command' | 'code-review' | 'explain' | 'fix-error';
  message: string;
  context?: {
    file?: string;
    selection?: string;
    error?: string;
  };
  timestamp: number;
};

async function sendTestRequest() {
  const request: KiroRequest = {
    id: `dora-${Date.now()}-test`,
    type: 'chat',
    message: 'Hello Kiro! This is Doraemon testing the bridge. Can you confirm you received this message?',
    timestamp: Date.now(),
  };
  
  console.log('📤 Sending test request to Kiro...');
  console.log('   Request ID:', request.id);
  console.log('   Message:', request.message);
  
  await fs.mkdir(DORAEMON_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DORAEMON_DIR, 'request.json'),
    JSON.stringify(request, null, 2)
  );
  
  console.log('✅ Request written to:', path.join(DORAEMON_DIR, 'request.json'));
  console.log('');
  console.log('🔄 Waiting for Kiro to respond...');
  console.log('   (Make sure Kiro is open with this workspace and hooks are enabled)');
  console.log('');
  
  const startTime = Date.now();
  const timeout = 60000;
  
  while (Date.now() - startTime < timeout) {
    try {
      const responsePath = path.join(DORAEMON_DIR, 'response.json');
      const content = await fs.readFile(responsePath, 'utf-8');
      const response = JSON.parse(content);
      
      if (response.id === request.id) {
        console.log('📥 Response received!');
        console.log('   Success:', response.success);
        console.log('   Result:', response.result || '(no result)');
        if (response.error) {
          console.log('   Error:', response.error);
        }
        
        await fs.unlink(responsePath).catch(() => {});
        return;
      }
    } catch {}
    
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write('.');
  }
  
  console.log('');
  console.log('⏰ Timeout! No response received within 60 seconds.');
  console.log('   Make sure:');
  console.log('   1. Kiro is running with this workspace open');
  console.log('   2. The doraemon-bridge hook is enabled');
  console.log('   3. Kiro is in Autopilot mode (for hooks to work)');
}

sendTestRequest().catch(console.error);
