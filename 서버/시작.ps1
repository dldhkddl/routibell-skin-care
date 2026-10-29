$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

Push-Location $root
try {
    & node (Join-Path $root 'node_modules/vite/bin/vite.js') preview --host 127.0.0.1 --port 4173 --strictPort
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
