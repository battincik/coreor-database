import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUpdaterManifest } from '../scripts/validate-updater-manifest.mjs';

const name = 'Coreor.Database_26.9.3_x64-setup.exe';
const base = 'https://github.com/battincik/coreor-database/releases/download/v26.9.3/';
const signature = Buffer.from('untrusted comment: signature from tauri secret key\nactual signature').toString('base64');
const manifest = { version: '26.9.3', platforms: { 'windows-x86_64': { url: base + name, signature } } };

test('rejects the published wrong-version URL and SHA-256 digest', () => {
  const broken = structuredClone(manifest);
  broken.platforms['windows-x86_64'].url = broken.platforms['windows-x86_64'].url.replaceAll('26.9.3', '26.9.2');
  broken.platforms['windows-x86_64'].signature = 'a1a91fff4c4c6a2cd1dfe858c6102c90cf54e51347de5eea037a790363bdd4b2';
  const errors = validateUpdaterManifest(broken, [{ name }], '26.9.3');
  assert.equal(errors.length, 2);
  assert.match(errors.join(' '), /download URL/);
  assert.match(errors.join(' '), /signature/);
});

test('accepts a matching release artifact and encoded signature', () => {
  assert.deepEqual(validateUpdaterManifest(manifest, [{ name }], '26.9.3'), []);
  assert.match(validateUpdaterManifest(manifest, [], '26.9.3').join(' '), /missing/);
});
