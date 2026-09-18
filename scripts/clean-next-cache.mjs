import fs from 'node:fs';

for (const target of ['.next']) {
  fs.rmSync(target, { recursive: true, force: true });
}

console.log('Stale Next.js generated route cache cleared.');
