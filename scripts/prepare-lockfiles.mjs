import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npm, ['install', '--package-lock-only', '--ignore-scripts']);
run(cargo, ['generate-lockfile', '--manifest-path', 'src-tauri/Cargo.toml']);

const required = ['package-lock.json', 'src-tauri/Cargo.lock'];
const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) {
  console.error('Lockfile üretilemedi: ' + missing.join(', '));
  process.exit(1);
}
console.log('Lockfile hazır: package-lock.json + src-tauri/Cargo.lock');
