import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateUpdaterManifest } from './validate-updater-manifest.mjs';

export const TARGET_VERSION = '26.11.2';
export const TARGET_RELEASE_ID = 444914553;
export const EXPECTED_SOURCE_SHA = '33749df96458c7dd4659ddd0fe326487a9f7fdc3';
const DEFAULT_REPO = 'battincik/coreor-database';
const TAG = `v${TARGET_VERSION}`;

export function normalizeRecoveryManifest(input, assets, repo = DEFAULT_REPO) {
  if (input.version !== TARGET_VERSION) throw new Error('Refusing to modify a different manifest version');
  const result = structuredClone(input);
  const assetByName = new Map(assets.map(asset => [asset.name, asset]));
  const assetById = new Map(assets.map(asset => [String(asset.id), asset]));
  const expectedRoot = `https://github.com/${repo}/releases/download/`;
  const apiRoot = `https://api.github.com/repos/${repo}/releases/assets/`;
  if (!result.platforms || Object.keys(result.platforms).length < 4) throw new Error('Manifest must include updater platforms');
  let modified = 0;
  for (const [platform, entry] of Object.entries(result.platforms)) {
    if (!entry?.url || typeof entry.url !== 'string') throw new Error(`${platform}: missing URL`);
    let asset;
    if (entry.url.startsWith(apiRoot) && /^\d+$/.test(entry.url.slice(apiRoot.length))) {
      asset = assetById.get(entry.url.slice(apiRoot.length));
    } else if (entry.url.startsWith(expectedRoot)) {
      const url = new URL(entry.url);
      if (url.search || url.hash) throw new Error(`${platform}: unexpected URL query or fragment`);
      const file = decodeURIComponent(url.pathname.split('/').at(-1));
      asset = assetByName.get(file);
    } else {
      throw new Error(`${platform}: unrecognized download origin ${entry.url}`);
    }
    if (!asset) throw new Error(`${platform}: referenced asset missing`);
    const next = `${expectedRoot}${TAG}/${encodeURIComponent(asset.name)}`;
    if (entry.url !== next) { entry.url = next; modified += 1; }
  }
  const errors = validateUpdaterManifest(result, assets, TARGET_VERSION);
  if (errors.length) throw new Error(`Invalid recovery manifest: ${errors.join('; ')}`);
  return { manifest: result, modified };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
  if (!token || repo !== DEFAULT_REPO) throw new Error('Requires repository-scoped GH_TOKEN');
  const localVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  if (localVersion !== TARGET_VERSION) throw new Error(`Expected source version ${TARGET_VERSION}, got ${localVersion}`);
  const root = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'coreor-database-release-recovery'
  };
  async function request(path, options = {}) {
    const url = path.startsWith('https://') ? path : root + path;
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) {
      throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 250)}`);
    }
    return response;
  }
  const get = async path => (await request(path)).json();
  const json = async (path, method, body) => (await request(path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })).json();
  const release = await get(`/releases/${TARGET_RELEASE_ID}`);
  if (release.name !== `Coreor Database ${TAG}` ||
      !['untagged-910018b0b9ff05e96171', TAG].includes(release.tag_name) ||
      release.assets?.length < 11 || release.target_commitish !== EXPECTED_SOURCE_SHA) {
    throw new Error('Release identity, source commit, or assets differ from the reviewed v26.11.2 release');
  }
  const manifestAsset = release.assets.find(a => a.name === 'latest.json');
  if (!manifestAsset) throw new Error('Original latest.json was not found; preserving release without modification');
  const bytes = Buffer.from(await (await request(`/releases/assets/${manifestAsset.id}`, {
    headers: {Accept: 'application/octet-stream'}
  })).arrayBuffer());
  const sourceManifest = JSON.parse(bytes.toString('utf8'));
  const {manifest, modified} = normalizeRecoveryManifest(sourceManifest, release.assets, repo);
  console.log(`Validated ${Object.keys(manifest.platforms).length} platform entries; ${modified} URLs need repair`);

  // Never overwrite an existing release tag pointing at unrelated code.
  let existingTag;
  try { existingTag = await get(`/git/ref/tags/${TAG}`); } catch (error) {
    if (!String(error).includes('HTTP 404')) throw error;
  }
  if (existingTag && existingTag.object?.sha !== EXPECTED_SOURCE_SHA) {
    throw new Error(`${TAG} already points to a different commit; refusing to retag`);
  }
  if (!existingTag) {
    // Some organizations prohibit GitHub Actions tokens from creating refs even
    // with contents:write. Fail before mutating the published release.
    throw new Error(
      `Missing Git tag ${TAG}. The GitHub Actions token cannot create tags in this repository. ` +
      `On your trusted workstation run: git fetch origin && git tag ${TAG} ${EXPECTED_SOURCE_SHA} && git push origin ${TAG}. ` +
      'Then rerun "Recover v26.11.2 updater release".'
    );
  }

  if (release.tag_name !== TAG) {
    await json(`/releases/${release.id}`, 'PATCH', { tag_name: TAG });
    console.log(`Updated release tag to ${TAG}`);
  }
  const published = await get(`/releases/${release.id}`);
  if (published.tag_name !== TAG || published.draft) throw new Error('Release tag not canonical or release unexpectedly draft');

  if (modified) {
    // Rename the original instead of deleting it; rollback remains possible.
    const backupName = `latest.json.previous-${process.env.GITHUB_RUN_ID || 'recovery'}`;
    const renamed = await json(`/releases/assets/${manifestAsset.id}`, 'PATCH', { name: backupName });
    let uploaded;
    try {
      const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=latest.json`;
      uploaded = await (await request(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
      })).json();
      if (uploaded.name !== 'latest.json') throw new Error('Replacement manifest upload returned an unexpected name');
      const readback = Buffer.from(await (await request(`/releases/assets/${uploaded.id}`, {
        headers: { Accept: 'application/octet-stream' }
      })).arrayBuffer());
      const actual = JSON.parse(readback.toString('utf8'));
      const errors = validateUpdaterManifest(actual, (await get(`/releases/${release.id}`)).assets, TARGET_VERSION);
      if (errors.length) throw new Error(errors.join('; '));
      await request(`/releases/assets/${renamed.id}`, { method: 'DELETE' });
      console.log(`Verified and replaced latest.json asset ${uploaded.id}`);
    } catch (error) {
      console.error('Failed to validate replacement. The previous manifest remains preserved as', backupName);
      if (!uploaded) {
        try { await json(`/releases/assets/${renamed.id}`, 'PATCH', { name: 'latest.json' }); }
        catch (rollbackError) { console.error('Automatic manifest rollback failed:', rollbackError); }
      }
      throw error;
    }
  }
  const final = await get(`/releases/${release.id}`);
  if (final.tag_name !== TAG || !final.assets.some(a => a.name === 'latest.json')) throw new Error('Release recovery incomplete');
  console.log(`Recovered ${TAG} release, ${final.assets.length} assets, permanent updater links`);
}
