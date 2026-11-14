import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateUpdaterManifest } from './validate-updater-manifest.mjs';

export function canonicalManifest(manifest, release, repo) {
  const prefix = `https://github.com/${repo}/releases/download/`;
  const target = `${prefix}${encodeURIComponent(release.tag_name)}/`;
  const assets = new Set(release.assets.map(a => a.name));
  let count = 0;
  const result = structuredClone(manifest);
  if (!result.platforms || typeof result.platforms !== 'object') throw new Error('Missing platforms');
  for (const [platform, item] of Object.entries(result.platforms)) {
    const url = new URL(item.url);
    if (!item.url.startsWith(prefix)) throw new Error(`${platform}: unexpected download origin`);
    const filename = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
    if (!assets.has(filename)) throw new Error(`${platform}: missing release asset ${filename}`);
    if (item.url !== target + encodeURIComponent(filename)) {
      const versionPart = item.url.slice(prefix.length).split('/')[0];
      if (!release.draft || !versionPart.startsWith('untagged-')) {
        throw new Error(`${platform}: refuses to rewrite non-draft, non-untagged URL`);
      }
      item.url = target + encodeURIComponent(filename);
      count++;
    }
  }
  return { manifest: result, rewritten: count };
}

const runningAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runningAsScript) {
  const repo = process.env.GITHUB_REPOSITORY || 'battincik/coreor-database';
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN required');
  const root = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'coreor-database-release-repair'
  };
  const request = async (url, options = {}) => {
    const response = await fetch(url.startsWith('https://') ? url : root + url, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${url}: HTTP ${response.status}, ${(await response.text()).slice(0,300)}`);
    return response;
  };
  const apiJson = async (url, opts) => (await request(url, opts)).json();
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const releases = [];
  for (let page=1; page<=5; page++) {
    const rows = await apiJson(`/releases?per_page=100&page=${page}`);
    releases.push(...rows);
    if (rows.length < 100) break;
  }
  const current = releases.find(r => r.tag_name === `v${version}`);
  if (!current) throw new Error(`Release v${version} not found`);

  // Update release notes for the two existing November releases, without publishing.
  for (const target of [
    { tag: 'v26.11.1', file: 'docs/releases/v26.11.1.md' },
    { tag: 'v26.11.2', file: 'docs/releases/v26.11.2.md' }
  ]) {
    const release = releases.find(r => r.tag_name === target.tag);
    if (!release || !fs.existsSync(target.file)) continue;
    const body = fs.readFileSync(target.file, 'utf8').trim();
    if (release.body?.trim() !== body) {
      await apiJson(`/releases/${release.id}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ body })
      });
      console.log(`Updated notes: ${target.tag}`);
    }
  }

  if (!current.draft) {
    console.log(`v${version} is published: no updater manifest replacement permitted`);
    process.exit(0);
  }
  const asset = current.assets.find(a => a.name === 'latest.json');
  if (!asset) throw new Error('latest.json not found in release');
  const response = await request(`/releases/assets/${asset.id}`, { headers:{Accept:'application/octet-stream'} });
  const original = Buffer.from(await response.arrayBuffer());
  const data = JSON.parse(original.toString('utf8'));
  if (typeof data.version !== 'string') throw new Error('GitHub returned asset metadata, not latest.json');
  const {manifest, rewritten} = canonicalManifest(data, current, repo);
  const errors = validateUpdaterManifest(manifest, current.assets, version);
  if (errors.length) throw new Error(`Manifest still invalid: ${errors.join('; ')}`);
  if (!rewritten) {
    console.log('Manifest already canonical; nothing to replace');
    process.exit(0);
  }

  const next = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  // Preserve the original until all replacement checks pass. A temp upload
  // allows recovery if GitHub fails after deleting the canonical asset.
  const upload = async (name, bytes) => {
    const url = `https://uploads.github.com/repos/${repo}/releases/${current.id}/assets?name=${encodeURIComponent(name)}`;
    return apiJson(url, { method:'POST', headers: {'Content-Type':'application/json'}, body:bytes });
  };
  const backupName = `latest.json.backup-${process.env.GITHUB_RUN_ID || 'manual'}`;
  const backup = await upload(backupName, original);
  console.log(`Backup uploaded as ${backupName}`);
  await request(`/releases/assets/${asset.id}`, {method:'DELETE'});
  let newAsset;
  try {
    newAsset = await upload('latest.json', next);
  } catch(error) {
    console.error('Replacement failed; attempting to restore original manifest');
    try { await upload('latest.json', original); } catch (restore) { console.error('Automatic restore failed:', restore); }
    throw error;
  }
  await request(`/releases/assets/${backup.id}`, {method:'DELETE'});
  console.log(`Repaired ${rewritten} platform URLs in v${version}, new asset id: ${newAsset.id}`);
}
