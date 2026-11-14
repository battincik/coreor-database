import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalManifest } from '../scripts/repair-release-metadata.mjs';
import { validateUpdaterManifest } from '../scripts/validate-updater-manifest.mjs';

const version = JSON.parse(fs.readFileSync('package.json','utf8')).version;
test('all application version sources match the new release', () => {
  assert.match(version, /^\\d{2}\\.\\d{1,2}\\.\\d+$/);
  assert.equal(JSON.parse(fs.readFileSync('package-lock.json','utf8')).packages[''].version,version);
  assert.equal(JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8')).version,version);
  assert.ok(fs.readFileSync('src-tauri/Cargo.toml','utf8').includes(`version = "${version}"`));
  assert.ok(fs.readFileSync('src/lib/appVersion.ts','utf8').includes(`APP_VERSION = '${version}'`));
});
test('draft manifest rewrites GitHub asset API IDs to public release URLs', () => {
  const asset={name:`Coreor.Database_${version}_x64-setup.exe`,id:100};
  const signature=Buffer.from('untrusted comment: test signature').toString('base64');
  const input={version,platforms:{'windows-x86_64':{url:'https://api.github.com/repos/battincik/coreor-database/releases/assets/100',signature}}};
  const fixed=canonicalManifest(input,{draft:true,tag_name:`v${version}`,assets:[asset]},'battincik/coreor-database');
  assert.equal(fixed.rewritten,1);
  assert.deepEqual(validateUpdaterManifest(fixed.manifest,[asset],version),[]);
});
