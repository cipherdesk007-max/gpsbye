#!/bin/bash
# Impacchetta l'IPA di FMLAB CarPlay per SideStore.
# Uso: bash packaging/package-ipa.sh <percorso .xcarchive> <file .ipa in uscita>
#
# - tiene solo le estensioni utili (registrazione schermo per la specchiatura),
#   così con un Apple ID gratuito SideStore usa 3 App ID invece di 6;
# - firma ad-hoc con i permessi CarPlay incorporati, come l'IPA TDS 1.5:
#   SideStore poi rifirma con il tuo Apple ID.
set -euo pipefail

ARCHIVE="$1"
mkdir -p "$(dirname "$2")"
OUT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
KEEP_APPEX="ScreenRec.appex ScreenRecSetupUI.appex"
HERE="$(cd "$(dirname "$0")" && pwd)"

APP="$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' | head -1)"
[ -d "$APP" ] || { echo "nessuna .app nell'archivio" >&2; exit 1; }

WORK="$(mktemp -d)"
mkdir -p "$WORK/Payload"
cp -R "$APP" "$WORK/Payload/"
APP="$WORK/Payload/$(basename "$APP")"

echo "==> Estensioni nell'app:"
ls "$APP/PlugIns" 2>/dev/null || true
if [ -d "$APP/PlugIns" ]; then
  for ext in "$APP"/PlugIns/*.appex; do
    name="$(basename "$ext")"
    case " $KEEP_APPEX " in
      *" $name "*) echo "    tengo:   $name" ;;
      *) echo "    rimuovo: $name"; rm -rf "$ext" ;;
    esac
  done
fi

echo "==> Firma ad-hoc"
if [ -d "$APP/PlugIns" ]; then
  for ext in "$APP"/PlugIns/*.appex; do
    codesign -f -s - "$ext"
  done
fi
find "$APP/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -exec codesign -f -s - {} \; 2>/dev/null || true
codesign -f -s - --entitlements "$HERE/FMLAB-CarPlay.entitlements" "$APP"
codesign -d --entitlements :- "$APP" | head -30

echo "==> Creo $OUT"
rm -f "$OUT"
(cd "$WORK" && zip -qry "$OUT" Payload)
ls -la "$OUT"
shasum -a 256 "$OUT"
