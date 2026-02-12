/**
 * Setup Page
 *
 * Checks: proxy health → OpenClaw gateway → optional browser extension → launch.
 * OpenClaw is optional — tool routing degrades to proxy-only if unavailable.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { GATEWAY } from '../core/constants/gateway';

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

type Step = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
};

const CheckIcon = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
    <path d="M3 7L6 10L11 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
    <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

const Spinner = () => (
  <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" opacity="0.25" />
    <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const SkipIcon = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
    <path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
  </svg>
);

const StatusIcon = ({ status }: { status: StepStatus }) => {
  if (status === 'running') return <Spinner />;
  if (status === 'success') return <CheckIcon />;
  if (status === 'error') return <XIcon />;
  if (status === 'skipped') return <SkipIcon />;
  return <div class="w-3.5 h-3.5 rounded-full border-[1.5px] border-current opacity-40" />;
};

const PROXY_URL = (import.meta as any).env?.VITE_PROXY_URL
  || 'https://doraemon-proxy.doraboss.workers.dev';

declare global {
  interface Window {
    setupAPI?: {
      setupComplete: () => void;
    };
  }
}

async function checkProxyHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json() as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function checkOpenClawHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    try {
      const ws = new WebSocket(`ws://${GATEWAY.DEFAULT_HOST}:${GATEWAY.DEFAULT_PORT}`);
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    } catch {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

const INITIAL_STEPS: Step[] = [
  { id: 'proxy', label: 'AI Connection', status: 'pending' },
  { id: 'openclaw', label: 'OpenClaw Gateway', status: 'pending' },
  { id: 'extension', label: 'Browser Extension', status: 'pending' },
];

export function SetupPage() {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [phase, setPhase] = useState<'checking' | 'extension' | 'complete' | 'failed'>('checking');
  const [retryCount, setRetryCount] = useState(0);

  const updateStep = useCallback((id: string, update: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  }, []);

  const runSetup = useCallback(async () => {
    setPhase('checking');
    setSteps(INITIAL_STEPS.map(s => ({ ...s })));

    // Step 1: Proxy
    updateStep('proxy', { status: 'running', detail: 'Checking...' });
    const proxyOk = await checkProxyHealth();

    if (!proxyOk) {
      updateStep('proxy', { status: 'error', detail: 'Unreachable' });
      setPhase('failed');
      return;
    }
    updateStep('proxy', { status: 'success', detail: 'Connected' });

    // Step 2: OpenClaw (optional — tool routing)
    updateStep('openclaw', { status: 'running', detail: 'Checking...' });
    const openclawOk = await checkOpenClawHealth();

    if (openclawOk) {
      updateStep('openclaw', { status: 'success', detail: 'Connected' });
    } else {
      updateStep('openclaw', { status: 'skipped', detail: 'Offline (optional)' });
    }

    // Step 3: Extension
    setPhase('extension');
  }, [updateStep]);

  const handleSkipExtension = useCallback(() => {
    updateStep('extension', { status: 'skipped', detail: 'Later' });
    setPhase('complete');
    setTimeout(() => window.setupAPI?.setupComplete(), 500);
  }, [updateStep]);

  const handleExtensionInstalled = useCallback(() => {
    updateStep('extension', { status: 'success', detail: 'Installed' });
    setPhase('complete');
    setTimeout(() => window.setupAPI?.setupComplete(), 500);
  }, [updateStep]);

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
    runSetup();
  }, [runSetup]);

  useEffect(() => { runSetup(); }, [runSetup]);

  const progress = steps.filter(s => s.status === 'success' || s.status === 'skipped').length / steps.length;

  const openclawStep = steps.find(s => s.id === 'openclaw');
  const openclawOffline = openclawStep?.status === 'skipped';

  return (
    <div class="h-screen w-screen flex flex-col select-none bg-[#F5F5F7]">
      <div class="h-[52px] drag-region flex-shrink-0" />

      <div class="flex-1 flex flex-col items-center px-10 pb-6">
        <div class="w-[64px] h-[64px] rounded-[16px] bg-white flex items-center justify-center mb-4 shadow-lg overflow-hidden">
          <img src="./dora-sprites/shime1a.png" alt="Doraemon" class="w-14 h-14 object-contain" />
        </div>

        <h1 class="text-[18px] font-semibold text-[#1D1D1F] tracking-tight text-center">
          {phase === 'complete' ? 'Ready to Go~!' :
           phase === 'failed' ? 'Connection Issue' :
           phase === 'extension' ? 'One More Thing' :
           'Setting Up'}
        </h1>
        <p class="text-[12px] text-[#86868B] mt-1 text-center">
          {phase === 'complete' ? 'Launching Doraemon...' :
           phase === 'failed' ? 'Could not reach the AI server' :
           phase === 'extension' ? 'Get notifications from your browser' :
           'Checking connections'}
        </p>

        <div class="w-full max-w-[300px] mt-5 mb-3">
          <div class="h-[3px] bg-[#E8E8ED] rounded-full overflow-hidden">
            <div
              class="h-full bg-[#0099FF] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div class="w-full max-w-[300px] space-y-0">
          {steps.map(step => (
            <div key={step.id} class="flex items-center justify-between py-1.5 px-1">
              <div class="flex items-center gap-2.5">
                <span class={
                  step.status === 'success' ? 'text-[#34C759]' :
                  step.status === 'error' ? 'text-[#FF3B30]' :
                  step.status === 'running' ? 'text-[#0099FF]' :
                  step.status === 'skipped' ? 'text-[#86868B]' :
                  'text-[#86868B]'
                }>
                  <StatusIcon status={step.status} />
                </span>
                <span class="text-[12px] text-[#1D1D1F]">{step.label}</span>
              </div>
              {step.detail && (
                <span class={`text-[10px] font-medium ${
                  step.status === 'error' ? 'text-[#FF3B30]' : 'text-[#86868B]'
                }`}>
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>

        {openclawOffline && phase === 'extension' && (
          <div class="w-full max-w-[300px] mt-3 p-2.5 bg-[#FFF9E6] rounded-lg border border-[#F5E6B8]">
            <p class="text-[11px] text-[#8B7A2B] leading-relaxed">
              OpenClaw gateway not detected. Tool features (weather, search, messaging) won't be available.
              Chat still works via the cloud proxy. To enable tools, start OpenClaw locally.
            </p>
          </div>
        )}

        {phase === 'extension' && (
          <ExtensionInstallCard
            onInstalled={handleExtensionInstalled}
            onSkip={handleSkipExtension}
          />
        )}

        {phase === 'failed' && (
          <div class="w-full max-w-[300px] mt-4 p-3 bg-white rounded-xl border border-[#E8E8ED]">
            <p class="text-[11px] text-[#86868B] leading-relaxed">
              Make sure you have internet access. The AI server might be deploying or temporarily down.
            </p>
            <button
              onClick={handleRetry}
              class="mt-3 h-[30px] px-4 text-[12px] font-medium text-white bg-[#0099FF] rounded-lg hover:bg-[#0088E6] active:bg-[#0077CC] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtensionInstallCard({
  onInstalled,
  onSkip,
}: {
  onInstalled: () => void;
  onSkip: () => void;
}) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div class="w-full max-w-[300px] mt-4 p-3 bg-white rounded-xl border border-[#E8E8ED]">
      <h3 class="text-[12px] font-semibold text-[#1D1D1F] mb-1">
        🔔 Browser Notifications
      </h3>
      <p class="text-[11px] text-[#86868B] leading-relaxed mb-2">
        Install the browser extension so Doraemon can react to your WhatsApp, Slack, Discord, and other web notifications.
      </p>

      {!showSteps ? (
        <div class="flex gap-2">
          <button
            onClick={() => setShowSteps(true)}
            class="flex-1 h-[30px] text-[12px] font-medium text-white bg-[#0099FF] rounded-lg hover:bg-[#0088E6] transition-colors"
          >
            Install Extension
          </button>
          <button
            onClick={onSkip}
            class="h-[30px] px-3 text-[12px] font-medium text-[#86868B] hover:text-[#1D1D1F] transition-colors"
          >
            Skip
          </button>
        </div>
      ) : (
        <div class="space-y-2">
          <div class="text-[11px] text-[#1D1D1F] space-y-1.5">
            <p class="flex gap-2">
              <span class="text-[#0099FF] font-semibold shrink-0">1.</span>
              Open Chrome → <code class="bg-[#F5F5F7] px-1 rounded text-[10px]">chrome://extensions</code>
            </p>
            <p class="flex gap-2">
              <span class="text-[#0099FF] font-semibold shrink-0">2.</span>
              Enable "Developer mode" (top right toggle)
            </p>
            <p class="flex gap-2">
              <span class="text-[#0099FF] font-semibold shrink-0">3.</span>
              Click "Load unpacked"
            </p>
            <p class="flex gap-2">
              <span class="text-[#0099FF] font-semibold shrink-0">4.</span>
              Select the <code class="bg-[#F5F5F7] px-1 rounded text-[10px]">browser-extension</code> folder inside Doraemon's app directory
            </p>
          </div>

          <p class="text-[10px] text-[#86868B] italic">
            Firefox: about:debugging → Load Temporary Add-on → select manifest.json
          </p>

          <div class="flex gap-2 pt-1">
            <button
              onClick={onInstalled}
              class="flex-1 h-[28px] text-[11px] font-medium text-white bg-[#34C759] rounded-lg hover:bg-[#2DB84E] transition-colors"
            >
              Done, I installed it
            </button>
            <button
              onClick={onSkip}
              class="h-[28px] px-3 text-[11px] font-medium text-[#86868B] hover:text-[#1D1D1F] transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
