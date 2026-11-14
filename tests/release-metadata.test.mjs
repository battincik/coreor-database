import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalManifest } from '../scripts/repair-release-metadata.mjs';

test('repairs only known assets in a draft release', () => {
  const release = { draft:true, tag_name:'v26.11.2', assets:[{name:'a.exe'}] };
  const input = { version:'26.11.2',platforms:{'windows-x86_64':{url:'https://github.com/battincik/coreor-database/releases/download/untagged-abcdef/a.exe', signature:'example'}} };
  const r = canonicalManifest(input, release, 'battincik/coreor-database');
  assert.equal(r.rewritten,1);
  assert.equal(r.manifest.platforms['windows-x86_64'].url,'https://github.com/battincik/coreor-database/releases/download/v26.11.2/a.exe');
  assert.match(input.platforms['windows-x86_64'].url,/untagged-/);
});
test('does not rewrite published releases', () => {
  const release={draft:false,tag_name:'v26.11.2',assets:[{name:'a.exe'}]};
  const input={platforms:{win:{url:'https://github.com/battincik/coreor-database/releases/download/untagged-abc/a.exe'}}};
  assert.throws(()=>canonicalManifest(input,release,'battincik/coreor-database'),/refuses/);
});
test('rejects assets absent from release', () => {
  const release={draft:true,tag_name:'v26.11.2',assets:[]};
  const input={platforms:{win:{url:'https://github.com/battincik/coreor-database/releases/download/untagged-abc/a.exe'}}};
  assert.throws(()=>canonicalManifest(input,release,'battincik/coreor-database'),/missing release asset/);
});
