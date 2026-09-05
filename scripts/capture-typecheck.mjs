import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('public', { recursive: true });

const child = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const exitCode = await new Promise(resolve => child.on('close', resolve));
const diagnostics = output.trim() || `TYPECHECK_OK (exit ${exitCode ?? 0})`;
await writeFile('public/typecheck.txt', `${diagnostics}\n`, 'utf8');
console.log(`Captured TypeScript diagnostics (exit ${exitCode ?? 0}) to public/typecheck.txt`);
