#!/bin/bash
# Prepara backend/dist/ (Apps Script) e dist/web/ (sito e app). Facoltativo: URL del server.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-web.js "${1:-}"
