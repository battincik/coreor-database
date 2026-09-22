import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function load(file, imports = {}, extra = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, Error, ...extra });
  return exports;
}
const { createActivityGate } = load('src/lib/updateActivity.ts');
test('update refuses concurrent requests until all jobs finish', () => {
  const gate = createActivityGate();
  const first = gate.begin(), second = gate.begin();
  assert.throws(() => gate.lock(), /UPDATE_ACTIVE_WORK/);
  first(); first();
  assert.equal(gate.count(), 1);
  assert.throws(() => gate.lock(), /UPDATE_ACTIVE_WORK/);
  second();
  const unlock = gate.lock();
  assert.throws(() => gate.begin(), /UPDATE_IN_PROGRESS/);
  assert.throws(() => gate.lock(), /UPDATE_ACTIVE_WORK/);
  unlock(); gate.begin()(); assert.equal(gate.count(), 0);
});
test('dirty editor blocks installation even without network traffic', () => {
  const gate = createActivityGate(), clean = gate.block();
  assert.throws(() => gate.lock(), /UPDATE_ACTIVE_WORK/);
  clean(); gate.lock()();
});
test('report excludes SQL, credentials, URLs, paths and raw messages; deduplicates', async () => {
  const events = [];
  const { reportAppError } = load('src/lib/errorReporting.ts', { '@tauri-apps/api/core': { invoke: async (...args) => events.push(args) } }, { window: { __TAURI_INTERNALS__: {} } });
  const error = new Error('SELECT secret FROM private; password=super-secret');
  error.stack = 'Error: confidential\n at f (https://private.host/_next/static/chunks/abc123.js:21:4)\n at C:\\Users\\Alice\\private.sql:2:1';
  reportAppError(error); reportAppError(error);
  assert.equal(events.length, 1);
  const json = JSON.stringify(events[0]);
  for (const value of ['SELECT', 'super-secret', 'private.host', 'Alice', 'confidential']) assert.ok(!json.includes(value));
  assert.ok(json.includes('abc123.js'));
  const db = new Error('server failure'); db.name = 'DatabaseClientError'; reportAppError(db);
  assert.equal(events.length, 1);
});
test('busy or open transaction never starts a successful restart; failed install unlocks', async () => {
  const gate = createActivityGate(); let installs = 0;
  const { checkForUpdates, installUpdate } = load('src/lib/appUpdater.ts', {
    react: { useSyncExternalStore: () => undefined }, './updateActivity': { updateActivity: gate },
    '@tauri-apps/api/core': { invoke: async command => {
      if (command === 'check_app_update') return { enabled: true, development: false, version: '3.2.0' };
      installs++; throw 'UPDATE_OPEN_TRANSACTION';
    } }
  });
  await checkForUpdates(); const finish = gate.begin(); await installUpdate(); assert.equal(installs, 0);
  finish(); await installUpdate(); assert.equal(installs, 1); assert.equal(gate.isInstalling(), false);
  gate.begin()();
});
test('development disabled response cannot trigger install', async () => {
  let installs = 0;
  const { checkForUpdates, installUpdate } = load('src/lib/appUpdater.ts', {
    react: {}, './updateActivity': { updateActivity: createActivityGate() },
    '@tauri-apps/api/core': { invoke: async command => {
      if (command === 'check_app_update') return { enabled: false, development: true, version: null };
      installs++;
    } }
  });
  await checkForUpdates(); await installUpdate(); assert.equal(installs, 0);
});
