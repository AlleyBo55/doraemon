import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

type IDEType = 'kiro' | 'vscode' | 'cursor' | 'antigravity';

const IDE_APPS: Record<IDEType, string> = {
  kiro: 'Kiro',
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
};

async function isAppRunning(appName: string): Promise<boolean> {
  try {
    const script = `
      tell application "System Events"
        set appList to name of every process whose background only is false
        return appList contains "${appName}"
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function detectRunningIDEs(): Promise<IDEType[]> {
  const running: IDEType[] = [];
  for (const [ide, appName] of Object.entries(IDE_APPS)) {
    if (await isAppRunning(appName)) {
      running.push(ide as IDEType);
    }
  }
  return running;
}

async function activateApp(appName: string): Promise<void> {
  const script = `
    tell application "${appName}"
      activate
    end tell
    delay 0.5
  `;
  await execAsync(`osascript -e '${script}'`);
}

async function sendKeystroke(keys: string): Promise<void> {
  const keyParts = keys.split(' ');
  let modifiers = '';
  let key = '';
  
  for (const part of keyParts) {
    if (['command', 'shift', 'option', 'control'].includes(part)) {
      modifiers += `${part} down, `;
    } else {
      key = part;
    }
  }
  
  modifiers = modifiers.slice(0, -2);
  
  const script = `
    tell application "System Events"
      keystroke "${key}" using {${modifiers}}
    end tell
    delay 0.3
  `;
  await execAsync(`osascript -e '${script}'`);
}

async function typeText(text: string): Promise<void> {
  const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const script = `
    tell application "System Events"
      keystroke "${escapedText}"
    end tell
  `;
  await execAsync(`osascript -e '${script}'`);
}

async function pressEnter(): Promise<void> {
  const script = `
    tell application "System Events"
      key code 36
    end tell
  `;
  await execAsync(`osascript -e '${script}'`);
}

async function sendToAntigravity(message: string): Promise<void> {
  console.log('🚀 Sending to Antigravity...');
  
  await activateApp('Antigravity');
  console.log('   ✓ Activated Antigravity');
  
  await sendKeystroke('command shift a');
  console.log('   ✓ Opened Agent panel (Cmd+Shift+A)');
  
  await new Promise(r => setTimeout(r, 500));
  
  await typeText(message);
  console.log('   ✓ Typed message');
  
  await new Promise(r => setTimeout(r, 100));
  await pressEnter();
  console.log('   ✓ Sent message');
}

async function sendToCursor(message: string): Promise<void> {
  console.log('🚀 Sending to Cursor...');
  
  await activateApp('Cursor');
  console.log('   ✓ Activated Cursor');
  
  await sendKeystroke('command l');
  console.log('   ✓ Opened Chat (Cmd+L)');
  
  await new Promise(r => setTimeout(r, 500));
  
  await typeText(message);
  console.log('   ✓ Typed message');
  
  await new Promise(r => setTimeout(r, 100));
  await pressEnter();
  console.log('   ✓ Sent message');
}

async function main() {
  console.log('🔍 Detecting running IDEs...\n');
  
  const runningIDEs = await detectRunningIDEs();
  
  if (runningIDEs.length === 0) {
    console.log('❌ No supported IDEs are running.');
    console.log('   Please open one of: Kiro, Antigravity, Cursor, or VS Code');
    return;
  }
  
  console.log('✅ Found running IDEs:', runningIDEs.join(', '));
  console.log('');
  
  const testMessage = 'Hello! This is Doraemon testing the IDE bridge. Can you confirm you received this message?';
  
  for (const ide of runningIDEs) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Testing ${ide.toUpperCase()}`);
    console.log('='.repeat(50));
    
    try {
      if (ide === 'antigravity') {
        await sendToAntigravity(testMessage);
      } else if (ide === 'cursor') {
        await sendToCursor(testMessage);
      } else if (ide === 'kiro') {
        console.log('📝 For Kiro, use the file-based protocol (test-kiro-bridge.ts)');
        console.log('   Kiro hooks will automatically process .doraemon/request.json');
      } else if (ide === 'vscode') {
        console.log('📝 VS Code requires GitHub Copilot extension');
        console.log('   Use Cmd+Shift+P → "GitHub Copilot: Open Chat"');
      }
      
      console.log('\n✅ Test completed for', ide);
    } catch (err) {
      console.error(`\n❌ Error testing ${ide}:`, err);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('All tests completed!');
  console.log('='.repeat(50));
}

main().catch(console.error);
