import { execFile } from 'node:child_process';

const POLL_INTERVAL_MS = 60_000; // check every 60s
const MAX_CONSECUTIVE_FAILURES = 3; // restart after 3 failed checks (~3 min)
const RESTART_COOLDOWN_MS = 5 * 60_000; // don't restart more than once per 5 min

let timer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let lastRestartAt = 0;

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function checkWhatsAppHealth(): Promise<boolean> {
  try {
    const output = await runCommand('openclaw', ['channels', 'status']);
    // Look for "connected" in the WhatsApp status line
    return output.includes('connected') && output.includes('running');
  } catch {
    return false;
  }
}

async function restartGateway(): Promise<boolean> {
  const now = Date.now();
  if (now - lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log('[GatewayWatchdog] Skipping restart — cooldown active');
    return false;
  }

  console.log('[GatewayWatchdog] Restarting gateway...');
  lastRestartAt = now;

  try {
    await runCommand('openclaw', ['gateway', 'restart']);
    console.log('[GatewayWatchdog] Gateway restarted successfully');
    return true;
  } catch (err) {
    console.error('[GatewayWatchdog] Restart failed:', err);
    return false;
  }
}

async function poll() {
  const healthy = await checkWhatsAppHealth();

  if (healthy) {
    if (consecutiveFailures > 0) {
      console.log('[GatewayWatchdog] WhatsApp recovered after', consecutiveFailures, 'failures');
    }
    consecutiveFailures = 0;
    return;
  }

  consecutiveFailures++;
  console.log('[GatewayWatchdog] WhatsApp unhealthy — failure', consecutiveFailures, '/', MAX_CONSECUTIVE_FAILURES);

  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const restarted = await restartGateway();
    if (restarted) consecutiveFailures = 0;
  }
}

export function startGatewayWatchdog() {
  if (timer) return;
  console.log('[GatewayWatchdog] Started — polling every', POLL_INTERVAL_MS / 1000, 's');
  timer = setInterval(poll, POLL_INTERVAL_MS);
  // Run first check after a short delay
  setTimeout(poll, 10_000);
}

export function stopGatewayWatchdog() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[GatewayWatchdog] Stopped');
  }
}
