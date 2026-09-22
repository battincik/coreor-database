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

function Get-ProcessTreeIds {
  param([int]$RootId)

  $processTable = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $ids = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  [void]$ids.Add($RootId)
  $queue.Enqueue($RootId)

  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($child in $processTable | Where-Object { [int]$_.ParentProcessId -eq $parent }) {
      $childId = [int]$child.ProcessId
      if ($ids.Add($childId)) { $queue.Enqueue($childId) }
    }
  }

  return @($ids)
}

Write-Host "Coreor Desktop resource profiler"
Write-Host "Root process: $ProcessName | Duration: $Seconds sn | Logical CPU: $logicalProcessors"
Write-Host "Native process + WebView2 child process tree is measured."
Write-Host ""

while ((Get-Date) -lt $deadline) {
  $root = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $root) {
    Write-Host "Process bekleniyor: $ProcessName.exe"
    Start-Sleep -Milliseconds $IntervalMs
    continue
  }

  $ids = Get-ProcessTreeIds -RootId $root.Id
  $processes = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_ })
  if (-not $processes.Count) {
    Start-Sleep -Milliseconds $IntervalMs
    continue
  }

  $now = Get-Date
  $cpuSeconds = ($processes | Measure-Object CPU -Sum).Sum
  $cpuPercent = 0.0
  if ($null -ne $previousCpu -and $null -ne $previousAt) {
    $elapsed = ($now - $previousAt).TotalSeconds
    if ($elapsed -gt 0) {
      $cpuPercent = (($cpuSeconds - $previousCpu) / $elapsed / $logicalProcessors) * 100
    }
  }

  $workingSet = ($processes | Measure-Object WorkingSet64 -Sum).Sum
  $private = ($processes | Measure-Object PrivateMemorySize64 -Sum).Sum
  $threads = ($processes | ForEach-Object { $_.Threads.Count } | Measure-Object -Sum).Sum
  $handles = ($processes | Measure-Object HandleCount -Sum).Sum

  $sample = [pscustomobject]@{
    Time = $now
    CpuPercent = [Math]::Max(0, [double]$cpuPercent)
    WorkingSetMB = [double]$workingSet / 1MB
    PrivateMB = [double]$private / 1MB
    Threads = [int]$threads
    Handles = [int]$handles
    Processes = $processes.Count
  }
  $samples += $sample

  Write-Host ("CPU {0,6:N2}% | RAM {1,8:N1} MB | Private {2,8:N1} MB | Proc {3,2} | Threads {4,4} | Handles {5,5}" -f $sample.CpuPercent, $sample.WorkingSetMB, $sample.PrivateMB, $sample.Processes, $sample.Threads, $sample.Handles)

  $previousCpu = $cpuSeconds
  $previousAt = $now
  Start-Sleep -Milliseconds $IntervalMs
}

if (-not $samples.Count) {
  Write-Error "$ProcessName.exe bulunamadı. Önce npm run tauri:dev ile uygulamayı açın."
}

$validCpu = @($samples | Select-Object -Skip 1)
$summary = [pscustomobject]@{
  Samples = $samples.Count
  AverageCpuPercent = if ($validCpu.Count) { ($validCpu | Measure-Object CpuPercent -Average).Average } else { 0 }
  PeakCpuPercent = if ($validCpu.Count) { ($validCpu | Measure-Object CpuPercent -Maximum).Maximum } else { 0 }
  AverageWorkingSetMB = ($samples | Measure-Object WorkingSetMB -Average).Average
  PeakWorkingSetMB = ($samples | Measure-Object WorkingSetMB -Maximum).Maximum
  PeakPrivateMB = ($samples | Measure-Object PrivateMB -Maximum).Maximum
  PeakProcesses = ($samples | Measure-Object Processes -Maximum).Maximum
  PeakThreads = ($samples | Measure-Object Threads -Maximum).Maximum
  PeakHandles = ($samples | Measure-Object Handles -Maximum).Maximum
}

Write-Host ""
Write-Host "================ RESOURCE SUMMARY ================"
$summary | Format-List
