import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function numberArg(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function stringArg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const durationSeconds = numberArg('--seconds', numberArg('-s', 30));
const intervalMs = numberArg('--interval', 1000);
const processName = stringArg('--process', 'coreor-database');

if (process.platform === 'win32') {
  const powershell = process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell.exe';
  const result = spawnSync(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', 'scripts/profile-desktop.ps1',
    '-ProcessName', processName,
    '-Seconds', String(durationSeconds),
    '-IntervalMs', String(intervalMs)
  ], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function readProcesses() {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,pcpu=,rss=,vsz=,comm='], { encoding: 'utf8' });
  return output.trim().split('\n').map(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) return null;
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      cpu: Number(match[3]),
      rssKb: Number(match[4]),
      vszKb: Number(match[5]),
      command: match[6].trim()
    };
  }).filter(Boolean);
}

function treeFor(processes, root) {
  const ids = new Set([root.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (ids.has(process.ppid) && !ids.has(process.pid)) {
        ids.add(process.pid);
        changed = true;
      }
    }
  }
  return processes.filter(process => ids.has(process.pid));
}

function fmt(value, digits = 1) {
  return Number(value).toFixed(digits);
}

console.log('Coreor Desktop resource profiler');
console.log(`Platform: ${process.platform} | Root process: ${processName} | Duration: ${durationSeconds}s`);
console.log('Native process and descendants are measured.\n');

const samples = [];
const deadline = Date.now() + durationSeconds * 1000;

while (Date.now() < deadline) {
  let processes;
  try {
    processes = readProcesses();
  } catch (error) {
    console.error('ps command failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const root = processes.find(process => {
    const command = process.command.toLowerCase();
    const wanted = processName.toLowerCase();
    return command.endsWith('/' + wanted) || command === wanted || command.includes('/' + wanted + '.app/');
  });

  if (!root) {
    console.log(`Waiting for process: ${processName}`);
    await sleep(intervalMs);
    continue;
  }

  const tree = treeFor(processes, root);
  const cpu = tree.reduce((sum, item) => sum + item.cpu, 0);
  const rssMb = tree.reduce((sum, item) => sum + item.rssKb, 0) / 1024;
  const virtualMb = tree.reduce((sum, item) => sum + item.vszKb, 0) / 1024;
  const sample = { cpu, rssMb, virtualMb, processes: tree.length };
  samples.push(sample);

  console.log(
    `CPU ${fmt(cpu, 2).padStart(7)}% | RAM ${fmt(rssMb).padStart(8)} MB | Virtual ${fmt(virtualMb).padStart(9)} MB | Proc ${String(tree.length).padStart(2)}`
  );
  await sleep(intervalMs);
}

if (!samples.length) {
  console.error(`${processName} was not found. Start the app with npm run tauri:dev first.`);
  process.exit(1);
}

const average = key => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
const peak = key => Math.max(...samples.map(sample => sample[key]));

console.log('\n================ RESOURCE SUMMARY ================');
console.log(`Samples             : ${samples.length}`);
console.log(`AverageCpuPercent   : ${fmt(average('cpu'), 2)}`);
console.log(`PeakCpuPercent      : ${fmt(peak('cpu'), 2)}`);
console.log(`AverageWorkingSetMB : ${fmt(average('rssMb'), 2)}`);
console.log(`PeakWorkingSetMB    : ${fmt(peak('rssMb'), 2)}`);
console.log(`PeakVirtualMB       : ${fmt(peak('virtualMb'), 2)}`);
console.log(`PeakProcesses       : ${Math.max(...samples.map(sample => sample.processes))}`);
