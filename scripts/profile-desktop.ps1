param(
  [string]$ProcessName = "coreor-database",
  [int]$Seconds = 30,
  [int]$IntervalMs = 1000
)

$ErrorActionPreference = "Stop"
$logicalProcessors = [Environment]::ProcessorCount
$samples = @()
$deadline = (Get-Date).AddSeconds([Math]::Max(5, $Seconds))
$previousCpu = $null
$previousAt = $null

Write-Host "Coreor Desktop resource profiler"
Write-Host "Process: $ProcessName | Duration: $Seconds sn | Logical CPU: $logicalProcessors"
Write-Host ""

while ((Get-Date) -lt $deadline) {
  $process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $process) {
    Write-Host "Process bekleniyor: $ProcessName.exe"
    Start-Sleep -Milliseconds $IntervalMs
    continue
  }

  $now = Get-Date
  $cpuSeconds = [double]$process.CPU
  $cpuPercent = 0.0
  if ($null -ne $previousCpu -and $null -ne $previousAt) {
    $elapsed = ($now - $previousAt).TotalSeconds
    if ($elapsed -gt 0) {
      $cpuPercent = (($cpuSeconds - $previousCpu) / $elapsed / $logicalProcessors) * 100
    }
  }

  $sample = [pscustomobject]@{
    Time = $now
    CpuPercent = [Math]::Max(0, $cpuPercent)
    WorkingSetMB = $process.WorkingSet64 / 1MB
    PrivateMB = $process.PrivateMemorySize64 / 1MB
    Threads = $process.Threads.Count
    Handles = $process.HandleCount
  }
  $samples += $sample

  Write-Host ("CPU {0,6:N2}% | RAM {1,8:N1} MB | Private {2,8:N1} MB | Threads {3,4} | Handles {4,5}" -f $sample.CpuPercent, $sample.WorkingSetMB, $sample.PrivateMB, $sample.Threads, $sample.Handles)

  $previousCpu = $cpuSeconds
  $previousAt = $now
  Start-Sleep -Milliseconds $IntervalMs
}

if (-not $samples.Count) {
  Write-Error "$ProcessName.exe bulunamadı. Önce npm run tauri:dev ile uygulamayı açın."
}

$validCpu = $samples | Select-Object -Skip 1
$summary = [pscustomobject]@{
  Samples = $samples.Count
  AverageCpuPercent = if ($validCpu.Count) { ($validCpu | Measure-Object CpuPercent -Average).Average } else { 0 }
  PeakCpuPercent = if ($validCpu.Count) { ($validCpu | Measure-Object CpuPercent -Maximum).Maximum } else { 0 }
  AverageWorkingSetMB = ($samples | Measure-Object WorkingSetMB -Average).Average
  PeakWorkingSetMB = ($samples | Measure-Object WorkingSetMB -Maximum).Maximum
  PeakPrivateMB = ($samples | Measure-Object PrivateMB -Maximum).Maximum
  PeakThreads = ($samples | Measure-Object Threads -Maximum).Maximum
  PeakHandles = ($samples | Measure-Object Handles -Maximum).Maximum
}

Write-Host ""
Write-Host "================ RESOURCE SUMMARY ================"
$summary | Format-List
