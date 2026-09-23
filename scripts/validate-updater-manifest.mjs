import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateUpdaterManifest(manifest, assets, expectedVersion) {
  const errors = [];
  if (manifest.version !== expectedVersion) errors.push(`Expected version ${expectedVersion}, got ${manifest.version}`);
  if (!manifest.platforms || typeof manifest.platforms !== 'object' || !Object.keys(manifest.platforms).length) {
    errors.push('No updater platforms were published');
  }
  const assetNames = new Set(assets.map(asset => typeof asset === 'string' ? asset : asset.name));
  for (const [platform, entry] of Object.entries(manifest.platforms || {})) {
    const prefix = `https://github.com/battincik/coreor-database/releases/download/v${expectedVersion}/`;
    if (typeof entry.url !== 'string' || !entry.url.startsWith(prefix)) {
      errors.push(`${platform}: download URL does not point to v${expectedVersion}`);
    } else {
      const name = decodeURIComponent(entry.url.slice(prefix.length));
      if (!name || name.includes('/') || !assetNames.has(name)) errors.push(`${platform}: release asset ${name} is missing`);
    }
    if (typeof entry.signature !== 'string'
      || !Buffer.from(entry.signature, 'base64').toString('utf8').startsWith('untrusted comment:')) {
      errors.push(`${platform}: signature must be the contents of the Tauri .sig file, not a SHA-256 digest`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , manifestPath, assetsPath] = process.argv;
  if (!manifestPath || !assetsPath) {
    console.error('Usage: node scripts/validate-updater-manifest.mjs latest.json release-assets.json');
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).assets;
  const expectedVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const errors = validateUpdaterManifest(manifest, assets, expectedVersion);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`Updater manifest verified for v${expectedVersion}`);
}
