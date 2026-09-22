import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoToml = read('src-tauri/Cargo.toml');
const cargoLock = read('src-tauri/Cargo.lock');
const appVersion = read('src/lib/appVersion.ts');

const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname = "coreor-database"\nversion = "([^"]+)"/)?.[1];
const frontendVersion = appVersion.match(/APP_VERSION = '([^']+)'/)?.[1];
const versions = {
  'package.json': pkg.version,
  'package-lock.json': packageLock.version,
  'package-lock.json root package': packageLock.packages?.['']?.version,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock': cargoLockVersion,
  'src-tauri/tauri.conf.json': config.version,
  'src/lib/appVersion.ts': frontendVersion
};

const mismatched = Object.entries(versions).filter(([, version]) => version !== pkg.version);
if (mismatched.length) {
  throw new Error(`Release versions differ from package.json ${pkg.version}: ${mismatched.map(([source, version]) => `${source}=${version ?? 'missing'}`).join(', ')}`);
}

if (!process.env.COREOR_UPDATER_PUBLIC_KEY?.trim() || !process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  throw new Error('COREOR_UPDATER_PUBLIC_KEY and TAURI_SIGNING_PRIVATE_KEY must be configured. Never commit private keys.');
}

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error('Stable releases require a stable SemVer version');
}

if (!read('CHANGELOG.md').includes(`## [${pkg.version}]`)) {
  throw new Error(`CHANGELOG.md does not contain a ${pkg.version} release section. Prepare version bumps with npm run version:prepare X.Y.Z before editing version files manually.`);
}

console.log(`Signed release prerequisites ready for ${pkg.version}.`);
