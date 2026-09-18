import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'types'];
const banned = [
  ['next-auth', 'NextAuth dependency'],
  ['next/server', 'Next.js server runtime'],
  ['getServerSession', 'server-side session'],
  ["fetch('/api", 'local web API fetch'],
  ['fetch("/api', 'local web API fetch'],
  ['/api/database', 'web database API'],
  ['@/lib/server', 'server backend import'],
  ['mysql2', 'Node MySQL driver'],
  ["from 'pg'", 'Node PostgreSQL driver'],
  ["from 'mssql'", 'Node MSSQL driver'],
  ['window.confirm(', 'browser-native confirm dialog'],
  ['window.alert(', 'browser-native alert dialog'],
  ['window.prompt(', 'browser-native prompt dialog']
];

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(target);
  }
}
roots.forEach(walk);

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [needle, label] of banned) if (source.includes(needle)) failures.push(`${file}: ${label} (${needle})`);
}
if (fs.existsSync(path.join('src', 'app', 'api'))) failures.push('src/app/api: native client cannot contain Next.js API routes');
if (fs.existsSync(path.join('src', 'lib', 'server'))) failures.push('src/lib/server: native client cannot contain a hosted database backend');
if (fs.existsSync('.env') || fs.existsSync('.env.local') || fs.existsSync('.env.example')) failures.push('.env*: native configuration must not depend on a hosted web runtime');

const requiredCrossPlatformFiles = [
  'src-tauri/tauri.windows.conf.json',
  'src-tauri/tauri.macos.conf.json',
  'src-tauri/tauri.linux.conf.json',
  'src-tauri/icons/app-icon.svg',
  'src/lib/platformRuntime.ts'
];
for (const file of requiredCrossPlatformFiles) {
  if (!fs.existsSync(file)) failures.push(`${file}: required cross-platform desktop file is missing`);
}

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  if (scripts['dev:web'] || scripts['build:web']) failures.push('package.json: hosted-web script naming is not allowed in the native client');
  if (!scripts['build:windows'] || !scripts['build:macos'] || !scripts['build:linux']) failures.push('package.json: Windows/macOS/Linux build scripts are required');
  if (!scripts['icons:ensure']) failures.push('package.json: icons:ensure is required for clean cross-platform builds');
  if (!scripts['native:check']) failures.push('package.json: native:check is required');
} catch (error) {
  failures.push(`package.json: could not validate native scripts (${error instanceof Error ? error.message : String(error)})`);
}

try {
  const tauriConfig = JSON.parse(fs.readFileSync(path.join('src-tauri', 'tauri.conf.json'), 'utf8'));
  if (tauriConfig?.build?.beforeDevCommand !== 'npm run ui:dev') failures.push('tauri.conf.json: beforeDevCommand must use ui:dev');
  if (tauriConfig?.build?.beforeBuildCommand !== 'npm run ui:build') failures.push('tauri.conf.json: beforeBuildCommand must use ui:build');
  if (tauriConfig?.bundle?.targets !== 'all') failures.push('tauri.conf.json: base bundle target must remain cross-platform');
} catch (error) {
  failures.push(`src-tauri/tauri.conf.json: invalid native config (${error instanceof Error ? error.message : String(error)})`);
}

if (failures.length) {
  console.error('Native-client architecture validation failed:\n' + failures.map(item => ` - ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Native-client architecture validation passed (${files.length} source files).`);
