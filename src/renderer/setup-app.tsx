import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { SetupLayout } from './ui/layouts';
import { SetupStep, SetupProgress, SetupError, type StepStatus } from './ui/components/setup';
import { Button } from './ui/primitives';
import './styles/globals.css';

type CheckResult = {
  success: boolean;
  message?: string;
  version?: string;
};

type Step = {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  error?: string;
};

const INITIAL_STEPS: Step[] = [
  { id: 'node', title: 'Node.js', description: 'Checking runtime...', status: 'pending' },
  { id: 'openclaw', title: 'OpenClaw', description: 'Checking installation...', status: 'pending' },
  { id: 'port', title: 'Port 3000', description: 'Checking availability...', status: 'pending' },
  { id: 'daemon', title: 'Daemon', description: 'Starting service...', status: 'pending' },
];

const SetupApp = () => {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const updateStep = useCallback((id: string, update: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s))
    );
  }, []);

  const runChecks = useCallback(async () => {
    setError(null);
    setSteps(INITIAL_STEPS);
    setCurrentStep(0);

    const api = (window as any).setupAPI;
    if (!api) {
      setError('Setup API not available');
      return;
    }

    updateStep('node', { status: 'running' });
    const nodeResult: CheckResult = await api.checkNode();
    if (!nodeResult.success) {
      updateStep('node', { status: 'error', error: nodeResult.message });
      setError('Node.js 22 LTS required');
      return;
    }
    updateStep('node', { status: 'success', description: `v${nodeResult.version}` });
    setCurrentStep(1);

    updateStep('openclaw', { status: 'running' });
    const clawResult: CheckResult = await api.checkOpenClaw();
    if (!clawResult.success) {
      updateStep('openclaw', { status: 'error', error: clawResult.message });
      setError('OpenClaw not installed. Run: npm i -g openclaw');
      return;
    }
    updateStep('openclaw', { status: 'success', description: 'Installed' });
    setCurrentStep(2);

    updateStep('port', { status: 'running' });
    const portResult: CheckResult = await api.checkPort();
    if (!portResult.success) {
      updateStep('port', { status: 'running', description: 'Killing process...' });
      await api.killPort();
    }
    updateStep('port', { status: 'success', description: 'Available' });
    setCurrentStep(3);

    updateStep('daemon', { status: 'running' });
    const daemonResult: CheckResult = await api.startDaemon();
    if (!daemonResult.success) {
      updateStep('daemon', { status: 'error', error: daemonResult.message });
      setError('Failed to start daemon');
      return;
    }
    updateStep('daemon', { status: 'success', description: 'Running' });
    setCurrentStep(4);

    setTimeout(() => api.setupComplete(), 1000);
  }, [updateStep]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const completedSteps = steps.filter((s) => s.status === 'success').length;

  return (
    <SetupLayout>
      <div class="space-y-4">
        <SetupProgress current={completedSteps} total={steps.length} label="Setup Progress" />

        <div class="divide-y divide-slate-100">
          {steps.map((step) => (
            <SetupStep
              key={step.id}
              title={step.title}
              description={step.description}
              status={step.status}
            />
          ))}
        </div>

        {error && (
          <SetupError
            title="Setup Failed"
            message={error}
            onRetry={runChecks}
          />
        )}

        {completedSteps === steps.length && (
          <div class="text-center py-2">
            <p class="text-sm text-emerald-600 font-medium">Ready to launch!</p>
          </div>
        )}
      </div>
    </SetupLayout>
  );
};

render(<SetupApp />, document.getElementById('app')!);
