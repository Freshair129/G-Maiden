param([string]$Root = (Join-Path $env:TEMP 'g-maiden-vcpkg'))
$ErrorActionPreference = 'Stop'
$revision = '9a5dfef5d1a0438a7d24856a85bd60f309d355e9'
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    if (Test-Path -LiteralPath $Root) { throw 'Native dependency directory exists without Git identity' }
    & git clone --filter=blob:none --no-checkout https://github.com/microsoft/vcpkg.git $Root
    if ($LASTEXITCODE -ne 0) { throw 'vcpkg clone failed' }
}
& git -C $Root checkout --detach $revision
if ($LASTEXITCODE -ne 0) { throw 'vcpkg checkout failed' }
if ((& git -C $Root rev-parse HEAD) -ne $revision) { throw 'vcpkg revision differs' }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'vcpkg.exe'))) {
    & (Join-Path $Root 'bootstrap-vcpkg.bat') -disableMetrics
    if ($LASTEXITCODE -ne 0) { throw 'vcpkg bootstrap failed' }
}
$env:VCPKG_DISABLE_METRICS = '1'
$env:VCPKG_MAX_CONCURRENCY = '2'
& (Join-Path $Root 'vcpkg.exe') install libvpx:x64-windows-static-md --classic --disable-metrics
if ($LASTEXITCODE -ne 0) { throw 'Native MSVC libvpx build failed' }
$env:VCPKG_ROOT = $Root
$env:VCPKG_DEFAULT_TRIPLET = 'x64-windows-static-md'
if ($env:GITHUB_ENV) {
    Add-Content -LiteralPath $env:GITHUB_ENV -Value "VCPKG_ROOT=$Root"
    Add-Content -LiteralPath $env:GITHUB_ENV -Value 'VCPKG_DEFAULT_TRIPLET=x64-windows-static-md'
}
Write-Output "MSVC native dependency ready at $Root"
