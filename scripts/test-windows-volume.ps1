$ErrorActionPreference = 'Stop'
$letter = @('R','S','T','U','V','W','X','Y','Z') | Where-Object { !(Test-Path "${_}:\") } | Select-Object -First 1
if (!$letter) { throw 'No unused drive letter for isolated NTFS validation' }
$vhd = Join-Path $env:RUNNER_TEMP ('DiskAtlas-validation-' + [guid]::NewGuid() + '.vhdx')
$script = Join-Path $env:RUNNER_TEMP 'DiskAtlas-diskpart.txt'
try {
  @"
create vdisk file="$vhd" maximum=1024 type=expandable
select vdisk file="$vhd"
attach vdisk
create partition primary
format fs=ntfs quick label=DiskAtlasTest
assign letter=$letter
"@ | Set-Content $script
  diskpart /s $script
  if (!(Test-Path "${letter}:\")) { throw 'Isolated test volume was not mounted' }
  fsutil usn createjournal m=33554432 a=4194304 "${letter}:"
  if ($LASTEXITCODE -ne 0) { throw 'Could not create test journal' }
  $env:DISKATLAS_NTFS_TEST_ROOT = "${letter}:\"
  node --import tsx tests/windows-volume.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'NTFS volume validation failed' }
} finally {
  @"
select vdisk file="$vhd"
detach vdisk
"@ | Set-Content $script
  diskpart /s $script
  Remove-Item $vhd -ErrorAction SilentlyContinue
  Remove-Item $script -ErrorAction SilentlyContinue
}
