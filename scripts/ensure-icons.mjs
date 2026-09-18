import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = [
  'src-tauri/icons/32x32.png',
  'src-tauri/icons/128x128.png',
  'src-tauri/icons/128x128@2x.png',
  'src-tauri/icons/icon.png',
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/icon.ico'
];

if (required.every(file => fs.existsSync(file))) {
  console.log('Desktop icons ready.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['tauri', 'icon', 'src-tauri/icons/app-icon.svg'], {
  stdio: 'inherit',
  shell: false
});

if (result.status !== 0) process.exit(result.status ?? 1);

const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) {
  console.error('Icon generation did not produce: ' + missing.join(', '));
  process.exit(1);
}

console.log('Cross-platform desktop icons generated.');
