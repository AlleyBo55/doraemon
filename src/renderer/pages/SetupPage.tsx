/**
 * Setup Page
 * 
 * Pre-flight checks for Node.js, OpenClaw, port, daemon, and permissions.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';

type StepStatus = 'pending' | 'running' | 'success' | 'error';

type Step = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  help?: { title: string; command?: string; description: string };
};

const INITIAL_STEPS: Step[] = [
  { id: 'node', label: 'Node.js Runtime', status: 'pending' },
  { id: 'openclaw', label: 'OpenClaw CLI', status: 'pending' },
  { id: 'port', label: 'Network Port', status: 'pending' },
  { id: 'daemon', label: 'Background Service', status: 'pending' },
  { id: 'fulldisk', label: 'Native Notifications', status: 'pending' },
];

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

const CopyIcon = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <path d="M10 4V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5.5A1.5 1.5 0 0 0 3 10h1" stroke="currentColor" stroke-width="1.5" />
  </svg>
);

const StatusIcon = ({ status }: { status: StepStatus }) => {
  if (status === 'running') return <Spinner />;
  if (status === 'success') return <CheckIcon />;
  if (status === 'error') return <XIcon />;
  return <div class="w-3.5 h-3.5 rounded-full border-[1.5px] border-current opacity-40" />;
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} class="flex items-center gap-1.5 text-[11px] text-[#0099FF] hover:text-[#0077CC] transition-colors">
      <CopyIcon />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

declare global {
  interface Window {
    setupAPI?: {
      checkNode: () => Promise<{ success: boolean; version?: string }>;
      checkOpenClaw: () => Promise<{ success: boolean }>;
      checkPort: () => Promise<{ success: boolean }>;
      killPort: () => Promise<void>;
      startDaemon: () => Promise<{ success: boolean }>;
      checkFullDiskAccess: () => Promise<boolean>;
      requestFullDiskAccess: () => Promise<void>;
      setupComplete: () => void;
    };
  }
}

export function SetupPage() {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [failedStep, setFailedStep] = useState<Step | null>(null);
  const [phase, setPhase] = useState<'checking' | 'complete' | 'failed'>('checking');

  const updateStep = useCallback((id: string, update: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  }, []);

  const runSetup = useCallback(async () => {
    setFailedStep(null);
    setPhase('checking');
    setSteps(INITIAL_STEPS);
    
    const api = window.setupAPI;
    if (!api) {
      const errorStep: Step = {
        id: 'api',
        label: 'Setup API',
        status: 'error',
        help: { title: 'Preload Script Error', description: 'The app failed to initialize. Try restarting or rebuilding the app.' },
      };
      setFailedStep(errorStep);
      setPhase('failed');
      return;
    }

    // Node.js check
    updateStep('node', { status: 'running' });
    const node = await api.checkNode();
    if (!node.success) {
      const step: Step = {
        id: 'node', label: 'Node.js Runtime', status: 'error', detail: 'v22+ required',
        help: { title: 'Install Node.js', description: 'Doraemon needs Node.js 22 or newer. Visit nodejs.org to download and install it, then restart this app.' },
      };
      updateStep('node', step);
      setFailedStep(step);
      setPhase('failed');
      return;
    }
    updateStep('node', { status: 'success', detail: `v${node.version}` });

    // OpenClaw check
    updateStep('openclaw', { status: 'running' });
    const claw = await api.checkOpenClaw();
    if (!claw.success) {
      const step: Step = {
        id: 'openclaw', label: 'OpenClaw CLI', status: 'error', detail: 'Not installed',
        help: { title: 'Install OpenClaw', command: 'npm install -g openclaw', description: 'OpenClaw powers Doraemon\'s AI features. Open Terminal, paste the command above, press Enter, then click Try Again.' },
      };
      updateStep('openclaw', step);
      setFailedStep(step);
      setPhase('failed');
      return;
    }
    updateStep('openclaw', { status: 'success', detail: 'Ready' });

    // Port check
    updateStep('port', { status: 'running' });
    const port = await api.checkPort();
    if (!port.success) {
      updateStep('port', { detail: 'Freeing port...' });
      await api.killPort();
    }
    updateStep('port', { status: 'success', detail: '3000' });

    // Daemon check
    updateStep('daemon', { status: 'running' });
    const daemon = await api.startDaemon();
    if (!daemon.success) {
      const step: Step = {
        id: 'daemon', label: 'Background Service', status: 'error', detail: 'Failed to start',
        help: { title: 'Service Error', command: 'openclaw daemon', description: 'The background service couldn\'t start. Try running the command above in Terminal to see what went wrong, then click Try Again.' },
      };
      updateStep('daemon', step);
      setFailedStep(step);
      setPhase('failed');
      return;
    }
    updateStep('daemon', { status: 'success', detail: 'Running' });

    // Full Disk Access check
    updateStep('fulldisk', { status: 'running' });
    const hasFullDisk = await api.checkFullDiskAccess();
    if (!hasFullDisk) {
      const step: Step = {
        id: 'fulldisk', label: 'Native Notifications', status: 'error', detail: 'Permission needed',
        help: { title: 'Grant Full Disk Access', description: 'Doraemon needs Full Disk Access to read notifications from apps like WhatsApp, Slack, and Discord. Click "Open Settings" below, add Doraemon to the list, then click "Try Again".' },
      };
      updateStep('fulldisk', step);
      setFailedStep(step);
      setPhase('failed');
      return;
    }
    updateStep('fulldisk', { status: 'success', detail: 'Enabled' });

    setPhase('complete');
    setTimeout(() => api.setupComplete(), 600);
  }, [updateStep]);

  const handleOpenFullDiskSettings = async () => {
    await window.setupAPI?.requestFullDiskAccess?.();
  };

  useEffect(() => { runSetup(); }, [runSetup]);

  const progress = steps.filter(s => s.status === 'success').length / steps.length;

  return (
    <div class="h-screen w-screen flex flex-col select-none bg-[#F5F5F7]">
      <div class="h-[52px] drag-region flex-shrink-0" />
      
      <div class="flex-1 flex flex-col items-center px-10 pb-6">
        <div class="w-[64px] h-[64px] rounded-[16px] bg-white flex items-center justify-center mb-4 shadow-lg overflow-hidden">
          <img src="/dora-sprites/shime1a.png" alt="Doraemon" class="w-14 h-14 object-contain" />
        </div>

        <h1 class="text-[18px] font-semibold text-[#1D1D1F] tracking-tight text-center">
          {phase === 'complete' ? 'Ready to Go' : phase === 'failed' ? 'Setup Paused' : 'Setting Up'}
        </h1>
        <p class="text-[12px] text-[#86868B] mt-1 text-center">
          {phase === 'complete' ? 'Launching Doraemon...' : phase === 'failed' ? 'Action required' : 'Checking requirements'}
        </p>

        <div class="w-full max-w-[300px] mt-5 mb-3">
          <div class="h-[3px] bg-[#E8E8ED] rounded-full overflow-hidden">
            <div class="h-full bg-[#0099FF] rounded-full transition-all duration-500 ease-out" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div class="w-full max-w-[300px] space-y-0">
          {steps.map(step => (
            <div key={step.id} class="flex items-center justify-between py-1.5 px-1">
              <div class="flex items-center gap-2.5">
                <span class={
                  step.status === 'success' ? 'text-[#34C759]' : 
                  step.status === 'error' ? 'text-[#FF3B30]' : 
                  step.status === 'running' ? 'text-[#0099FF]' : 'text-[#86868B]'
                }>
                  <StatusIcon status={step.status} />
                </span>
                <span class="text-[12px] text-[#1D1D1F]">{step.label}</span>
              </div>
              {step.detail && (
                <span class={`text-[10px] font-medium tabular-nums ${step.status === 'error' ? 'text-[#FF3B30]' : 'text-[#86868B]'}`}>
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>

        {failedStep?.help && (
          <div class="w-full max-w-[300px] mt-4 p-3 bg-white rounded-xl border border-[#E8E8ED]">
            <h3 class="text-[12px] font-semibold text-[#1D1D1F] mb-1.5">{failedStep.help.title}</h3>
            
            {failedStep.help.command && (
              <div class="flex items-center justify-between bg-[#F5F5F7] rounded-lg px-2.5 py-1.5 mb-2">
                <code class="text-[11px] text-[#1D1D1F] font-mono">{failedStep.help.command}</code>
                <CopyButton text={failedStep.help.command} />
              </div>
            )}
            
            <p class="text-[11px] text-[#86868B] leading-relaxed">{failedStep.help.description}</p>
            
            {failedStep.id === 'fulldisk' && (
              <button onClick={handleOpenFullDiskSettings} class="mt-2 text-[11px] font-medium text-[#0099FF] hover:text-[#0077CC] transition-colors">
                Open Settings →
              </button>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <button onClick={runSetup} class="mt-4 h-[30px] px-4 text-[12px] font-medium text-white bg-[#0099FF] rounded-lg hover:bg-[#0088E6] active:bg-[#0077CC] transition-colors">
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
