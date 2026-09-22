import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STABLE_SEMVER = /^\d+\.\d+\.\d+$/;
const CALENDAR_VERSION = /^(\d{2})\.(\d{1,2})\.(\d+)$/;

function fail(message) {
  console.error(`[version:prepare] ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(ROOT, relativePath), content);
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) fail(`Could not locate ${label}.`);
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

const args = process.argv.slice(2);
const targetVersion = args.find(argument => !argument.startsWith('--'));
const dateArgument = args.find(argument => argument.startsWith('--date='));
const releaseDate = dateArgument?.slice('--date='.length) || new Date().toISOString().slice(0, 10);

if (!targetVersion) {
  fail('Usage: npm run version:prepare 26.9.1');
}
if (!STABLE_SEMVER.test(targetVersion)) {
  fail(`Expected a stable SemVer-compatible calendar version such as 26.9.1, received "${targetVersion}".`);
}
const calendarMatch = targetVersion.match(CALENDAR_VERSION);
if (!calendarMatch) {
  fail(`Coreor releases must use YY.M.RELEASE format, for example 26.9.1; received "${targetVersion}".`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
  fail(`Invalid release date "${releaseDate}". Use --date=YYYY-MM-DD when overriding it.`);
}

const [releaseYear, releaseMonth] = releaseDate.split('-').map(Number);
const expectedYear = releaseYear % 100;
const expectedMonth = releaseMonth;
const versionYear = Number(calendarMatch[1]);
const versionMonth = Number(calendarMatch[2]);
const releaseNumber = Number(calendarMatch[3]);
if (versionYear !== expectedYear || versionMonth !== expectedMonth || releaseNumber < 1) {
  fail(`Target version ${targetVersion} must match release date ${releaseDate} as YY.M.RELEASE and RELEASE must be >= 1.`);
}

const packageJson = json('package.json');
const currentVersion = packageJson.version;
if (!STABLE_SEMVER.test(currentVersion)) {
  fail(`Current package.json version "${currentVersion}" is not a stable SemVer version.`);
}
if (compareVersions(targetVersion, currentVersion) <= 0) {
  fail(`Target version ${targetVersion} must be greater than current version ${currentVersion}.`);
}

const changes = new Map();

packageJson.version = targetVersion;
changes.set('package.json', jsonText(packageJson));

const packageLock = json('package-lock.json');
if (packageLock.version !== currentVersion || packageLock.packages?.['']?.version !== currentVersion) {
  fail('package-lock.json root version is not synchronized with package.json before the bump.');
}
packageLock.version = targetVersion;
packageLock.packages[''].version = targetVersion;
changes.set('package-lock.json', jsonText(packageLock));

let cargoToml = read('src-tauri/Cargo.toml');
cargoToml = replaceRequired(
  cargoToml,
  /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
  (_match, before, version, after) => {
    if (version !== currentVersion) fail(`Cargo.toml version ${version} does not match package.json ${currentVersion}.`);
    return `${before}${targetVersion}${after}`;
  },
  'src-tauri/Cargo.toml package version'
);
changes.set('src-tauri/Cargo.toml', cargoToml);

let cargoLock = read('src-tauri/Cargo.lock');
cargoLock = replaceRequired(
  cargoLock,
  /(\[\[package\]\]\r?\nname = "coreor-database"\r?\nversion = ")([^"]+)(")/,
  (_match, before, version, after) => {
    if (version !== currentVersion) fail(`Cargo.lock coreor-database version ${version} does not match package.json ${currentVersion}.`);
    return `${before}${targetVersion}${after}`;
  },
  'src-tauri/Cargo.lock coreor-database package'
);
changes.set('src-tauri/Cargo.lock', cargoLock);

const tauriConfig = json('src-tauri/tauri.conf.json');
if (tauriConfig.version !== currentVersion) {
  fail(`tauri.conf.json version ${tauriConfig.version} does not match package.json ${currentVersion}.`);
}
tauriConfig.version = targetVersion;
changes.set('src-tauri/tauri.conf.json', jsonText(tauriConfig));

let appVersion = read('src/lib/appVersion.ts');
appVersion = replaceRequired(
  appVersion,
  /export const APP_VERSION = '([^']+)';/,
  (_match, version) => {
    if (version !== currentVersion) fail(`src/lib/appVersion.ts version ${version} does not match package.json ${currentVersion}.`);
    return `export const APP_VERSION = '${targetVersion}';`;
  },
  'src/lib/appVersion.ts APP_VERSION'
);
changes.set('src/lib/appVersion.ts', appVersion);

let changelog = read('CHANGELOG.md');
if (changelog.includes(`## [${targetVersion}]`)) {
  fail(`CHANGELOG.md already contains a ${targetVersion} release section.`);
}
const changelogEol = changelog.includes('\r\n') ? '\r\n' : '\n';
changelog = replaceRequired(
  changelog,
  /## \[Unreleased\]\r?\n/,
  `## [Unreleased]${changelogEol}${changelogEol}## [${targetVersion}] - ${releaseDate}${changelogEol}`,
  'CHANGELOG.md Unreleased section'
);
changes.set('CHANGELOG.md', changelog);

for (const [relativePath, content] of changes) {
  write(relativePath, content);
}

console.log('');
console.log(`Coreor Database ${currentVersion} -> ${targetVersion}`);
console.log(`Release date: ${releaseDate}`);
console.log('');
for (const relativePath of changes.keys()) {
  console.log(`  updated  ${relativePath}`);
}
console.log('');
console.log('Next:');
console.log('  npm run check');
console.log('  git diff --check');
console.log('  review CHANGELOG.md before creating the signed release candidate');
