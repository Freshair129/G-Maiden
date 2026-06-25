<#
  G-Maiden deep telemetry capture — records HW + process + network state at max
  depth Windows exposes, for VRAM-budget validation during a real Dota flow.

  Single snapshot:   powershell -ExecutionPolicy Bypass -File capture.ps1 -Label baseline
  Timeline (match):  powershell -ExecutionPolicy Bypass -File capture.ps1 -Label match -IntervalSec 2 -Count 150

  Output: tools/telemetry/logs/<label>-<yyyyMMdd-HHmmss>/
    system-info.json        one-time host/HW inventory
    snapshot-NNN.json       structured per-tick capture
    nvidia-NNN.txt          raw `nvidia-smi -q` full dump per tick
    capture.log             run log
  Every probe is wrapped so one failure (e.g. localized counter names) never
  aborts the run — it records {error:"..."} instead.
#>
param(
  [string]$Label = "snap",
  [int]$IntervalSec = 0,
  [int]$Count = 1
)

$ErrorActionPreference = "Continue"
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $root ("logs\{0}-{1}" -f $Label, $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$logFile = Join-Path $outDir "capture.log"
function Log($m) { $line = "{0}  {1}" -f (Get-Date -Format "HH:mm:ss.fff"), $m; $line; Add-Content -Path $logFile -Value $line -Encoding utf8 }
function Try-Probe($name, [scriptblock]$block) { try { & $block } catch { @{ error = "$name`: $($_.Exception.Message)" } } }

Log "capture start -> $outDir (interval=${IntervalSec}s count=$Count)"

# ---------------- one-time system inventory ----------------
$sys = [ordered]@{
  captured_at = (Get-Date).ToString("o")
  host        = $env:COMPUTERNAME
  os          = Try-Probe os { $o = Get-CimInstance Win32_OperatingSystem; [ordered]@{ caption=$o.Caption; version=$o.Version; build=$o.BuildNumber; locale=(Get-WinSystemLocale).Name } }
  cpu         = Try-Probe cpu { $c = Get-CimInstance Win32_Processor | Select-Object -First 1; [ordered]@{ name=$c.Name.Trim(); cores=$c.NumberOfCores; logical=$c.NumberOfLogicalProcessors; maxclock_mhz=$c.MaxClockSpeed } }
  ram_total_gb= Try-Probe ram { [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1) }
  gpu         = Try-Probe gpu {
                  $q = (& nvidia-smi --query-gpu=name,driver_version,memory.total,pcie.link.gen.max,pcie.link.width.max --format=csv,noheader,nounits) -split ","
                  [ordered]@{ name=$q[0].Trim(); driver=$q[1].Trim(); vram_total_mib=[int]$q[2].Trim(); pcie_gen=$q[3].Trim(); pcie_width=$q[4].Trim() }
                }
  disks       = Try-Probe disk { Get-PhysicalDisk | ForEach-Object { [ordered]@{ id=$_.DeviceId; name=$_.FriendlyName; media=$_.MediaType.ToString(); size_gb=[math]::Round($_.Size/1GB) } } }
}
$sys | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $outDir "system-info.json") -Encoding utf8
Log ("host: {0} | {1} | RAM {2}GB | GPU {3}" -f $sys.host, $sys.cpu.name, $sys.ram_total_gb, $sys.gpu.name)

# ---------------- per-process GPU usage via Windows perf counters ----------------
function Get-GpuPerProcess {
  # \GPU Process Memory(pid_NNN_..._phys_0)\Dedicated Usage  (+ Shared)
  # \GPU Engine(pid_NNN_..._engtype_XXX)\Utilization Percentage
  $mem = @{}; $eng = @{}
  try {
    (Get-Counter '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples | ForEach-Object {
      if ($_.InstanceName -match 'pid_(\d+)') { $pid2=[int]$Matches[1]; if(-not $mem[$pid2]){$mem[$pid2]=@{ded=0;shr=0}}; $mem[$pid2].ded += [double]$_.CookedValue }
    }
    (Get-Counter '\GPU Process Memory(*)\Shared Usage' -ErrorAction SilentlyContinue).CounterSamples | ForEach-Object {
      if ($_.InstanceName -match 'pid_(\d+)') { $pid2=[int]$Matches[1]; if(-not $mem[$pid2]){$mem[$pid2]=@{ded=0;shr=0}}; $mem[$pid2].shr += [double]$_.CookedValue }
    }
  } catch { return @{ error = "GPU Process Memory counter unavailable (localized name?): $($_.Exception.Message)" } }
  try {
    (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples | ForEach-Object {
      if ($_.InstanceName -match 'pid_(\d+).*engtype_(\w+)') {
        $pid2=[int]$Matches[1]; $type=$Matches[2]; $v=[double]$_.CookedValue
        if ($v -gt 0) { if(-not $eng[$pid2]){$eng[$pid2]=@{}}; if(-not $eng[$pid2][$type]){$eng[$pid2][$type]=0}; $eng[$pid2][$type]+=$v }
      }
    }
  } catch {}
  $rows = foreach ($p in $mem.Keys) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    [ordered]@{
      pid=$p; name=($proc.ProcessName); ded_mib=[math]::Round($mem[$p].ded/1MB,1); shr_mib=[math]::Round($mem[$p].shr/1MB,1)
      engines=($eng[$p] | ForEach-Object { $_ })
    }
  }
  ,($rows | Sort-Object { $_.ded_mib } -Descending)
}

# ---------------- one tick ----------------
function Capture-Tick($idx) {
  $tick = [ordered]@{ idx=$idx; t=(Get-Date).ToString("o") }

  # raw nvidia-smi -q full dump (max depth)
  Try-Probe nvqdump { (& nvidia-smi -q) | Set-Content -Path (Join-Path $outDir ("nvidia-{0:000}.txt" -f $idx)) -Encoding utf8 } | Out-Null

  $tick.gpu = Try-Probe gpu_query {
    $q = (& nvidia-smi --query-gpu=memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem,fan.speed,pstate --format=csv,noheader,nounits) -split ","
    [ordered]@{ vram_total=[int]$q[0].Trim(); vram_used=[int]$q[1].Trim(); vram_free=[int]$q[2].Trim(); util_gpu_pct=[int]$q[3].Trim(); util_mem_pct=[int]$q[4].Trim(); temp_c=[int]$q[5].Trim(); power_w=[double]$q[6].Trim(); power_limit_w=[double]$q[7].Trim(); clock_sm_mhz=[int]$q[8].Trim(); clock_mem_mhz=[int]$q[9].Trim(); fan_pct=$q[10].Trim(); pstate=$q[11].Trim() }
  }

  # nvidia-smi encoder/decoder + sm/mem sampling
  $tick.gpu_dmon = Try-Probe dmon { $d = (& nvidia-smi dmon -c 1 -s pucvmet) 2>$null; ($d | Where-Object { $_ -notmatch '^#' } | Select-Object -Last 1) }

  # nvidia-smi's own per-process view (often N/A on WDDM, capture anyway)
  $tick.gpu_procs_nvsmi = Try-Probe nvprocs {
    (& nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader) +
    (& nvidia-smi --query-gpu=count --format=csv,noheader | Out-Null)
  }

  # per-process GPU via Windows counters (the deep one)
  $tick.gpu_per_process = Get-GpuPerProcess

  # memory
  $tick.mem = Try-Probe mem { $o=Get-CimInstance Win32_OperatingSystem; [ordered]@{ total_mb=[math]::Round($o.TotalVisibleMemorySize/1KB); free_mb=[math]::Round($o.FreePhysicalMemory/1KB); used_mb=[math]::Round(($o.TotalVisibleMemorySize-$o.FreePhysicalMemory)/1KB) } }

  # cpu total
  $tick.cpu = Try-Probe cpu { [ordered]@{ util_pct=[math]::Round((Get-Counter '\Processor Information(_Total)\% Processor Utility' -ErrorAction Stop).CounterSamples[0].CookedValue,1) } }

  # top processes by RAM (+cpu seconds), tag the ones we care about
  $tick.processes = Try-Probe procs {
    $watch = 'dota2|ollama|llama-server|chrome|msedge|discord|g-maiden|gmaiden|maiden|node|python|obs|streamlabs'
    Get-Process | Where-Object { $_.WorkingSet64 -gt 50MB -or $_.ProcessName -match $watch } |
      Sort-Object WorkingSet64 -Descending | Select-Object -First 25 |
      ForEach-Object { [ordered]@{ pid=$_.Id; name=$_.ProcessName; ram_mb=[math]::Round($_.WorkingSet64/1MB); cpu_s=[math]::Round($_.CPU,1); threads=$_.Threads.Count; watched=([bool]($_.ProcessName -match $watch)) } }
  }

  # network: established connections + owning process + adapter throughput
  $tick.network = [ordered]@{
    connections = Try-Probe net_conn {
      Get-NetTCPConnection -State Established -ErrorAction Stop | ForEach-Object {
        $op = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        [ordered]@{ local=("{0}:{1}" -f $_.LocalAddress,$_.LocalPort); remote=("{0}:{1}" -f $_.RemoteAddress,$_.RemotePort); proc=($op.ProcessName); pid=$_.OwningProcess }
      } | Where-Object { $_.remote -notmatch '^(127\.|::1|0\.0\.0\.0)' } | Select-Object -First 40
    }
    listeners = Try-Probe net_listen {
      Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in 3000,11434,4577,1420 } |
        ForEach-Object { $op=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [ordered]@{ port=$_.LocalPort; proc=($op.ProcessName); pid=$_.OwningProcess } }
    }
    adapters = Try-Probe net_adapter {
      Get-NetAdapterStatistics -ErrorAction Stop | Where-Object { $_.ReceivedBytes -gt 0 } |
        ForEach-Object { [ordered]@{ name=$_.Name; rx_mb=[math]::Round($_.ReceivedBytes/1MB,1); tx_mb=[math]::Round($_.SentBytes/1MB,1) } }
    }
  }

  $f = Join-Path $outDir ("snapshot-{0:000}.json" -f $idx)
  $tick | ConvertTo-Json -Depth 8 | Set-Content -Path $f -Encoding utf8
  $gp = $tick.gpu
  Log ("tick {0:000}  VRAM {1}/{2}MB  gpu {3}%  {4}W {5}C  RAM used {6}MB  conns {7}" -f $idx, $gp.vram_used, $gp.vram_total, $gp.util_gpu_pct, $gp.power_w, $gp.temp_c, $tick.mem.used_mb, ($tick.network.connections | Measure-Object).Count)
  return $tick
}

# ---------------- run ----------------
$ticks = for ($i=0; $i -lt $Count; $i++) {
  Capture-Tick $i
  if ($i -lt $Count-1 -and $IntervalSec -gt 0) { Start-Sleep -Seconds $IntervalSec }
}
Log ("capture done: {0} snapshot(s) -> {1}" -f $Count, $outDir)
Write-Output ("OUTDIR=" + $outDir)
