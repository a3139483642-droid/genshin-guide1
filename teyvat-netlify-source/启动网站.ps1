$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '请先安装 Node.js 22.12 或更高版本。'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}
Write-Host '网站启动后，请打开 http://127.0.0.1:4173；首次使用访问 /setup。'
& npm.cmd run dev
