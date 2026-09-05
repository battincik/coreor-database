import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const exitCode = await new Promise(resolve => child.on('close', resolve));
const diagnostics = output.trim() || `TYPECHECK_OK (exit ${exitCode ?? 0})`;

await mkdir('.vercel/output/static', { recursive: true });
await writeFile('.vercel/output/config.json', JSON.stringify({ version: 3 }), 'utf8');
await writeFile('.vercel/output/static/typecheck.txt', `${diagnostics}\n`, 'utf8');
await writeFile('.vercel/output/static/index.html', '<!doctype html><meta charset="utf-8"><title>Typecheck diagnostics</title><pre>Open /typecheck.txt</pre>', 'utf8');
console.log(`Published TypeScript diagnostics (exit ${exitCode ?? 0}) to Vercel static output.`);
