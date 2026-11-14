import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecoveryManifest } from '../scripts/recover-published-release.mjs';
const assets = [
  { id: 745863093, name: 'Coreor.Database_26.11.2_x64-setup.exe' },
  { id: 1, name: 'Coreor.Database_26.11.2_amd64.AppImage' },
  { id: 2, name: 'Coreor.Database_26.11.2_aarch64.app.tar.gz' },
  { id: 3, name: 'Coreor.Database_26.11.2_x64.app.tar.gz' }
];
const sig = Buffer.from('untrusted comment: signed artifact\nproof').toString('base64');
function sample(url) {
  const platforms = Object.fromEntries(assets.map((asset, index) => [
    ['windows-x86_64','linux-x86_64','darwin-aarch64','darwin-x86_64'][index],
    { url: url(asset), signature: sig }
  ]));
  return { version:'26.11.2', platforms };
}
test('maps GitHub API release asset references to signed public download URLs', () => {
  const { manifest, modified } = normalizeRecoveryManifest(sample(asset =>
    `https://api.github.com/repos/battincik/coreor-database/releases/assets/${asset.id}`), assets);
  assert.equal(modified, 4);
  assert.equal(manifest.platforms['windows-x86_64'].url,
    'https://github.com/battincik/coreor-database/releases/download/v26.11.2/Coreor.Database_26.11.2_x64-setup.exe');
});
test('supports temporary untagged URLs and is idempotent', () => {
  const initial = sample(asset =>
    `https://github.com/battincik/coreor-database/releases/download/untagged-910018b0b9ff05e96171/${asset.name}`);
  const repaired = normalizeRecoveryManifest(initial, assets);
  assert.equal(repaired.modified, 4);
  assert.equal(normalizeRecoveryManifest(repaired.manifest, assets).modified, 0);
});
test('rejects missing assets and unexpected hosts', () => {
  assert.throws(() => normalizeRecoveryManifest(sample(() =>
    'https://malicious.example.com/app.exe'), assets), /unrecognized download origin/);
  assert.throws(() => normalizeRecoveryManifest(sample(() =>
    'https://api.github.com/repos/battincik/coreor-database/releases/assets/999999999'), assets), /referenced asset missing/);
});
