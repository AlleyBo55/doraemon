export function getInstallInstructions(): {
  nodeInstructions: string[];
  openclawInstructions: string[];
  buildToolsInstructions: string[];
} {
  const nodeInstructions = [
    '# Install Node.js 22 LTS using nvm (recommended)',
    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash',
    'nvm install 22',
    'nvm use 22',
  ];

  const openclawInstructions = [
    '# Install OpenClaw globally',
    'npm install -g openclaw@latest',
    '',
    '# Run the onboard wizard',
    'openclaw onboard --install-daemon',
  ];

  let buildToolsInstructions: string[];

  if (process.platform === 'darwin') {
    buildToolsInstructions = ['# Install Xcode Command Line Tools', 'xcode-select --install'];
  } else if (process.platform === 'win32') {
    buildToolsInstructions = ['# Install Windows Build Tools (run as Administrator)', 'npm install -g windows-build-tools'];
  } else {
    buildToolsInstructions = ['# Install build-essential', 'sudo apt-get update', 'sudo apt-get install build-essential'];
  }

  return { nodeInstructions, openclawInstructions, buildToolsInstructions };
}
