param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId
)

$pending = [System.Collections.Generic.Queue[int]]::new()
$seen = [System.Collections.Generic.HashSet[int]]::new()
$pending.Enqueue($ProcessId)
$workingSet = [int64]0

while ($pending.Count -gt 0) {
  $current = $pending.Dequeue()
  if (-not $seen.Add($current)) {
    continue
  }

  try {
    $workingSet += (Get-Process -Id $current -ErrorAction Stop).WorkingSet64
  } catch {
    continue
  }

  Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = $current" -ErrorAction SilentlyContinue |
    ForEach-Object { $pending.Enqueue([int]$_.ProcessId) }
}

[Console]::Out.WriteLine($workingSet)
