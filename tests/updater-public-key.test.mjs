import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUpdaterPublicKey } from '../scripts/updater-public-key.mjs';

const minisign = 'untrusted comment: minisign public key: A49EF4746FA6E6D7\\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe';
const decoded = minisign.replace('\\n', '\n') + '\n';
const encoded = Buffer.from(decoded).toString('base64');

test('accepts the original Tauri .pub base64 file and a decoded minisign public key', () => {
  assert.equal(normalizeUpdaterPublicKey(encoded), encoded);
  assert.equal(normalizeUpdaterPublicKey(decoded), encoded);
});

test('rejects an empty key, a bare minisign body, a path, and invalid base64', () => {
  for (const value of ['', 'RWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe', 'C:\\\\keys\\\\signing.key.pub', 'AQID']) {
    assert.throws(() => normalizeUpdaterPublicKey(value), /COREOR_UPDATER_PUBLIC_KEY/);
  }
});

test('rejects an encoded incomplete key with missing comment', () => {
  const bodyOnly = Buffer.from('RWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe').toString('base64');
  assert.throws(() => normalizeUpdaterPublicKey(bodyOnly), /FULL \\.pub file/);
});
