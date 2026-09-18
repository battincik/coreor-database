import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const iconDir = 'src-tauri/icons';
const sourceIcon = path.join(iconDir, 'app-icon.svg');
const requiredNames = [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.icns',
  'icon.ico'
];
const required = requiredNames.map(name => path.join(iconDir, name));
const missing = required.filter(file => !fs.existsSync(file));

if (!missing.length) {
  console.log('Desktop icons ready.');
  process.exit(0);
}

// Generate into a temporary directory so an existing tracked Windows icon is
// never overwritten just because another platform derivative is missing.
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreor-database-icons-'));
let exitCode = 0;

try {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    command,
    ['tauri', 'icon', sourceIcon, '--output', outputDir],
    {
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  } else {
    for (const target of missing) {
      const generated = path.join(outputDir, path.basename(target));
      if (!fs.existsSync(generated)) {
        console.error('Icon generation did not produce: ' + generated);
        exitCode = 1;
        continue;
      }

      fs.copyFileSync(generated, target);
    }

    const stillMissing = required.filter(file => !fs.existsSync(file));
    if (stillMissing.length) {
      console.error('Desktop icons are still missing: ' + stillMissing.join(', '));
      exitCode = 1;
    }
  }
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

if (exitCode !== 0) process.exit(exitCode);

console.log('Cross-platform desktop icons generated.');
