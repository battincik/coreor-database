import fs from 'node:fs';
const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1];
if (pkg.version !== config.version || pkg.version !== cargoVersion) throw new Error('Release versions differ: package.json / Cargo.toml / tauri.conf.json');
if (!process.env.COREOR_UPDATER_PUBLIC_KEY?.trim() || !process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  throw new Error('COREOR_UPDATER_PUBLIC_KEY and TAURI_SIGNING_PRIVATE_KEY must be configured. Never commit private keys.');
}
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Stable releases require a stable SemVer version');
console.log(`Signed release prerequisites ready for ${pkg.version}.`);
