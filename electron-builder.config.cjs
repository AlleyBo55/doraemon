/**
 * electron-builder configuration
 *
 * Builds .dmg (macOS), .exe/NSIS (Windows), .AppImage + .deb (Linux)
 * Assets are bundled from electron-vite's `out/` directory.
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.doraboss.doraemon',
  productName: 'Doraemon',
  copyright: 'Copyright © 2026 AlleyBo55',

  directories: {
    output: 'dist',
    buildResources: 'build',
  },

  files: [
    'out/**/*',
    'assets/**/*',
    'browser-extension/**/*',
    'package.json',
  ],

  extraResources: [
    { from: 'assets', to: 'assets' },
    { from: 'browser-extension', to: 'browser-extension' },
    { from: '.env', to: '.env' },
  ],

  mac: {
    target: [
      { target: 'dmg', arch: ['arm64'] },
    ],
    icon: 'build/icon.png',
    category: 'public.app-category.utilities',
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
    window: { width: 540, height: 380 },
  },

  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    icon: 'build/icons',
    category: 'Utility',
  },

  publish: null,
};
