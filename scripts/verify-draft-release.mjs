import fs from 'node:fs';
import { validateUpdaterManifest } from './validate-updater-manifest.mjs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const repo = process.env.GITHUB_REPOSITORY || 'battincik/coreor-database';
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required for draft release access.');

const apiBase = `https://api.github.com/repos/${repo}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'coreor-database-release-verifier'
};

async function api(path) {
  const response = await fetch(`${apiBase}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function downloadAsset(id) {
  const response = await fetch(`${apiBase}/releases/assets/${id}`, {
    headers: { ...headers, Accept: 'application/octet-stream' }
  });
  if (!response.ok) throw new Error(`Could not download latest.json asset: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  // A missing octet-stream negotiation may return asset metadata rather than bytes.
  const data = JSON.parse(body.toString('utf8'));
  if (!data || data.name === 'latest.json' || typeof data.version !== 'string') {
    throw new Error('GitHub returned asset metadata instead of latest.json contents.');
  }
  return data;
}

let release;
for (let page = 1; page <= 10; page += 1) {
  const batch = await api(`/releases?per_page=100&page=${page}`);
  release = batch.find(item => item.tag_name === `v${version}`);
  if (release || batch.length < 100) break;
}
if (!release) throw new Error(`Release v${version} not found through GitHub API (including drafts).`);
if (!release.draft) throw new Error(`Release v${version} is no longer a draft; inspect published release separately.`);
const asset = release.assets.find(item => item.name === 'latest.json');
if (!asset) throw new Error(`Draft release v${version} has no latest.json asset.`);
const manifest = await downloadAsset(asset.id);
const errors = validateUpdaterManifest(manifest, release.assets, version);
if (errors.length) throw new Error(`Updater manifest validation failed:\n${errors.join('\n')}`);
console.log(`Verified draft release v${version}: ${release.assets.length} assets, ${Object.keys(manifest.platforms).length} updater platform(s).`);
