import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const valueOf = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);

const installAfterBuild = has('--install');
const signed = has('--signed');
const skipCheck = has('--skip-check');
const fullCheck = has('--full-check');
const allowDirty = has('--allow-dirty');
const publicKeyFile = valueOf('--public-key-file=');
const privateKeyFile = valueOf('--private-key-file=');
const outputOverride = valueOf('--output=');
const bundleOverride = valueOf('--bundles=');

function fail(message) {
  console.error(`[release:local] ${message}`);
  process.exit(1);
}

function info(message = '') {
  console.log(`[release:local] ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function run(command, commandArgs, options = {}) {
  info(`> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: options.env ?? process.env
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with code ${result.status ?? 'unknown'}.`);
}

function output(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function cargoPackageVersion(lockText, packageName) {
  const parts = lockText.split(/(?=^\[\[package\]\]\r?$)/m);
  for (const part of parts) {
    if (!part.startsWith('[[package]]')) continue;
    const name = part.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1];
    if (name !== packageName) continue;
    return part.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? null;
  }
  return null;
}

function resolveKey(envName, filePath, label) {
  const current = process.env[envName]?.trim();
  if (current) return current;
  if (!filePath) return '';
  const resolved = path.resolve(ROOT, filePath);
  if (!fs.existsSync(resolved)) fail(`${label} file not found: ${resolved}`);
  const value = fs.readFileSync(resolved, 'utf8').trim();
  if (!value) fail(`${label} file is empty: ${resolved}`);
  return value;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute) : [absolute];
  });
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function copyArtifacts(files, destination) {
  ensureDirectory(destination);
  return files.map(source => {
    const target = path.join(destination, path.basename(source));
    fs.copyFileSync(source, target);
    return target;
  });
}

function platformPlan() {
  if (process.platform === 'win32') {
    return {
      name: 'windows-x64',
      bundles: bundleOverride || 'nsis',
      installExtensions: ['.exe'],
      artifactExtensions: ['.exe', '.msi', '.sig', '.zip']
    };
  }
  if (process.platform === 'darwin') {
    return {
      name: process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64',
      bundles: bundleOverride || 'app,dmg',
      installExtensions: ['.dmg'],
      artifactExtensions: ['.dmg', '.tar.gz', '.sig']
    };
  }
  if (process.platform === 'linux') {
    return {
      name: 'linux-x64',
      bundles: bundleOverride || 'appimage',
      installExtensions: ['.AppImage'],
      artifactExtensions: ['.AppImage', '.sig', '.tar.gz']
    };
  }
  fail(`Unsupported local release platform: ${process.platform}`);
}

function matchesArtifact(file, extensions) {
  const lower = file.toLowerCase();
  return extensions.some(extension => lower.endsWith(extension.toLowerCase()));
}

function versionChecks() {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const tauri = readJson('src-tauri/tauri.conf.json');
  const cargoToml = read('src-tauri/Cargo.toml');
  const cargoLock = read('src-tauri/Cargo.lock');
  const appVersion = read('src/lib/appVersion.ts');

  const versions = {
    'package.json': pkg.version,
    'package-lock.json': lock.version,
    'package-lock root': lock.packages?.['']?.version,
    'Cargo.toml': cargoToml.match(/^[ \t]*version\s*=\s*"([^"]+)"/m)?.[1],
    'Cargo.lock': cargoPackageVersion(cargoLock, 'coreor-database'),
    'tauri.conf.json': tauri.version,
    'appVersion.ts': appVersion.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1]
  };

  const mismatch = Object.entries(versions).filter(([, version]) => version !== pkg.version);
  if (mismatch.length) {
    fail(`Version mismatch against package.json ${pkg.version}: ${mismatch.map(([source, version]) => `${source}=${version ?? 'missing'}`).join(', ')}`);
  }

  if (!/^\d{2}\.(?:[1-9]|1[0-2])\.[1-9]\d*$/.test(pkg.version)) {
    fail(`Version ${pkg.version} does not follow YY.M.RELEASE.`);
  }

  if (!read('CHANGELOG.md').includes(`## [${pkg.version}]`)) {
    fail(`CHANGELOG.md has no release section for ${pkg.version}.`);
  }

  return pkg.version;
}

const version = versionChecks();
const plan = platformPlan();
const publicKey = resolveKey('COREOR_UPDATER_PUBLIC_KEY', publicKeyFile, 'Updater public key');

if (!publicKey) {
  fail(
    'COREOR_UPDATER_PUBLIC_KEY is required for a release build so the installed app can verify future updates. ' +
    'Set the environment variable or pass --public-key-file=<path>.'
  );
}

const privateKey = signed
  ? resolveKey('TAURI_SIGNING_PRIVATE_KEY', privateKeyFile, 'Updater private key')
  : '';

if (signed && !privateKey) {
  fail(
    'Signed updater artifacts require TAURI_SIGNING_PRIVATE_KEY. ' +
    'Set it locally or pass --private-key-file=<path>. GitHub Actions secrets are not available to local processes.'
  );
}

const status = output('git', ['status', '--porcelain']);
if (status && !allowDirty) {
  fail('Working tree is not clean. Commit/stash changes first, or use --allow-dirty for an explicit local smoke build.');
}

const commit = output('git', ['rev-parse', 'HEAD']) || 'unknown';
const branch = output('git', ['branch', '--show-current']) || 'detached';

info('');
info(`Coreor Database v${version}`);
info(`Branch: ${branch}`);
info(`Commit: ${commit}`);
info(`Platform: ${plan.name}`);
info(`Bundles: ${plan.bundles}`);
info(`Updater artifacts: ${signed ? 'signed' : 'not generated'}`);
info('');

if (!skipCheck) {
  if (fullCheck) {
    run('npm', ['run', 'check']);
  } else {
    // Local installer smoke gate. Full public-release gate remains `npm run check`.
    run('npm', ['run', 'test:lifecycle']);
    run('npm', ['run', 'locks:check']);
    run('npm', ['run', 'architecture:check']);
    run('npm', ['run', 'i18n:check']);
    run('npm', ['run', 'typecheck']);
    run('npm', ['run', 'native:check']);
  }
}

run('npm', ['run', 'icons:ensure']);

const buildEnvironment = {
  ...process.env,
  COREOR_UPDATER_PUBLIC_KEY: publicKey
};
if (privateKey) buildEnvironment.TAURI_SIGNING_PRIVATE_KEY = privateKey;

const tauriArgs = [
  'tauri',
  'build',
  '--bundles',
  plan.bundles
];
if (signed) {
  tauriArgs.splice(2, 0, '--config', 'src-tauri/tauri.release.conf.json');
}

const buildStartedAt = Date.now();
run('npx', tauriArgs, { env: buildEnvironment });

const bundleRoot = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');
const artifacts = walkFiles(bundleRoot)
  .filter(file => matchesArtifact(file, plan.artifactExtensions))
  .filter(file => {
    try {
      return fs.statSync(file).mtimeMs >= buildStartedAt - 5_000;
    } catch {
      return false;
    }
  });

if (!artifacts.length) {
  fail(`No release artifacts were found under ${bundleRoot}.`);
}

const releaseRoot = path.resolve(
  ROOT,
  outputOverride || path.join('local-releases', `v${version}`, plan.name)
);

if (fs.existsSync(releaseRoot)) fs.rmSync(releaseRoot, { recursive: true, force: true });
const copied = copyArtifacts(artifacts, releaseRoot);

const manifest = {
  product: 'Coreor Database',
  version,
  branch,
  commit,
  platform: plan.name,
  bundles: plan.bundles.split(','),
  updaterPublicKeyEmbedded: true,
  signedUpdaterArtifacts: signed,
  builtAt: new Date().toISOString(),
  dirtyBuild: Boolean(status),
  artifacts: copied.map(file => ({
    file: path.basename(file),
    bytes: fs.statSync(file).size,
    sha256: sha256(file)
  }))
};
fs.writeFileSync(path.join(releaseRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

info('');
info(`Local release ready: ${releaseRoot}`);
for (const artifact of manifest.artifacts) {
  info(`  ${artifact.file}  sha256:${artifact.sha256}`);
}

if (!installAfterBuild) {
  info('');
  info('Install manually from the folder above, or run the install helper:');
  info('  npm run release:local:install -- --public-key-file=<path-to-public-key>');
  if (!signed) {
    info('');
    info('For N -> N+1 updater artifact testing later:');
    info('  npm run release:local:signed -- --public-key-file=<pub> --private-key-file=<private>');
  }
  process.exit(0);
}

const installer = copied.find(file => plan.installExtensions.some(extension => file.toLowerCase().endsWith(extension.toLowerCase())));
if (!installer) {
  fail(`Build succeeded but no locally installable artifact was found for ${plan.name}.`);
}

info(`Launching installer: ${installer}`);

if (process.platform === 'win32') {
  const child = spawn(installer, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
} else if (process.platform === 'darwin') {
  const child = spawn('open', [installer], { detached: true, stdio: 'ignore' });
  child.unref();
} else {
  fs.chmodSync(installer, 0o755);
  const child = spawn(installer, [], { detached: true, stdio: 'ignore' });
  child.unref();
}
