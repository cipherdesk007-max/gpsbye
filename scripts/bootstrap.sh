#!/usr/bin/env bash
# bootstrap.sh — Ricostruisce il progetto Reloc localizzato in italiano
#
# Questo repository contiene SOLO: la localizzazione italiana (patch),
# i checksum e questo script. I sorgenti completi vengono ricostruiti
# dal commit upstream pinnato di Reukix/Reloc (AGPL-3.0) e poi
# localizzati applicando la patch, con verifica SHA-256 finale.
#
# Uso (dopo il clone o il download di questo repository):
#   bash scripts/bootstrap.sh
set -euo pipefail

UPSTREAM_REPO="Reukix/Reloc"
UPSTREAM_COMMIT="8dc5aaa6b9e2599423fdb903e4edc8eecc0b9c9f" # commit upstream verificato
UPSTREAM_TARBALL="https://api.github.com/repos/${UPSTREAM_REPO}/tarball/${UPSTREAM_COMMIT}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SHA_CMD="$(command -v shasum >/dev/null 2>&1 && echo shasum || echo sha256sum)"

echo "==> 1/4 Scarico i sorgenti upstream (${UPSTREAM_REPO} @ ${UPSTREAM_COMMIT:0:9})…"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$UPSTREAM_TARBALL" -o "$TMP_DIR/upstream.tar.gz"
else
  wget -qO "$TMP_DIR/upstream.tar.gz" "$UPSTREAM_TARBALL"
fi
mkdir -p "$TMP_DIR/upstream"
tar xzf "$TMP_DIR/upstream.tar.gz" -C "$TMP_DIR/upstream" --strip-components=1

echo "==> 2/4 Copio l'albero del progetto (lasciando intatti README, script e patch)…"
# File di questo repository da NON sovrascrivere con l'upstream
is_repo_owned() {
  case "$1" in
    README.md|scripts/*|patches/*|NOTICE) return 0 ;;
    *) return 1 ;;
  esac
}
copied=0
while IFS= read -r -d '' f; do
  rel="${f#"$TMP_DIR/upstream"/}"
  if is_repo_owned "$rel"; then continue; fi
  mkdir -p "$ROOT_DIR/$(dirname "$rel")"
  cp "$f" "$ROOT_DIR/$rel"
  copied=$((copied + 1))
done < <(find "$TMP_DIR/upstream" -type f -print0)

echo "    Copiati $copied file (inclusi i binari del bridge Rust e le icone)."

echo "==> 3/4 Applico la localizzazione italiana…"
cat "$ROOT_DIR/patches/italian-1.patch" \
    "$ROOT_DIR/patches/italian-2.patch" \
    "$ROOT_DIR/patches/italian-3.patch" > "$TMP_DIR/italian.patch"

if command -v git >/dev/null 2>&1 \
   && git -C "$ROOT_DIR" apply --check "$TMP_DIR/italian.patch" 2>/dev/null; then
  git -C "$ROOT_DIR" apply "$TMP_DIR/italian.patch"
  echo "    Applicata con: git apply"
elif command -v patch >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && patch -p1 --batch < "$TMP_DIR/italian.patch" >/dev/null)
  echo "    Applicata con: patch -p1"
elif command -v python3 >/dev/null 2>&1; then
  PATCH_FILE="$TMP_DIR/italian.patch" ROOT_DIR="$ROOT_DIR" python3 - <<'PYEOF'
import os, re, sys

patch_file = os.environ["PATCH_FILE"]
root = os.environ["ROOT_DIR"]

def read(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()

def split_lines(text):
    lines, cur = [], ""
    for ch in text:
        cur += ch
        if ch == "\n":
            lines.append(cur); cur = ""
    if cur:
        lines.append(cur)
    return lines

text = read(patch_file)
files, cur = [], None
for line in text.split("\n"):
    if line.startswith("--- a/"):
        cur = {"new": None, "hunks": []}
    elif line.startswith("+++ b/") and cur is not None:
        cur["new"] = line[6:]
        files.append(cur)
    elif cur is not None and files and cur is files[-1]:
        if line.startswith("@@"):
            cur["hunks"].append([line])
        elif cur["hunks"]:
            cur["hunks"][-1].append(line)

for f in files:
    rel = f["new"]
    path = os.path.join(root, rel)
    src_lines = split_lines(read(path))
    out, pos = [], 0
    for hunk in f["hunks"]:
        m = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", hunk[0])
        idx = int(m.group(1)) - 1
        if idx < pos:
            sys.exit(f"hunk sovrapposti in {rel}")
        out.extend(src_lines[pos:idx]); pos = idx
        for hl in hunk[1:]:
            if hl == "" or hl.startswith("\\"):
                continue
            tag, content = hl[0], hl[1:]
            if tag in (" ", "-"):
                expected = src_lines[pos]
                if expected.rstrip("\n") != content.rstrip("\n"):
                    sys.exit(f"contesto non corrispondente in {rel} riga {pos+1}\n  atteso:  {expected!r}\n  trovato: {content!r}")
                if tag == " ":
                    out.append(expected)
                pos += 1
            elif tag == "+":
                out.append(content + "\n")
    out.extend(src_lines[pos:])
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("".join(out))
    print(f"    localizzato: {rel}")
PYEOF
  echo "    Applicata con: python3"
else
  echo "    ERRORE: servono 'git', 'patch' o 'python3' per applicare la localizzazione." >&2
  exit 1
fi

echo "==> 4/4 Verifico l'integrità (SHA-256) di tutti i file…"
fail=0
while read -r expected rel; do
  [ -z "${rel:-}" ] && continue
  if [ ! -f "$ROOT_DIR/$rel" ]; then
    echo "   MANCANTE: $rel" >&2; fail=1; continue
  fi
  actual="$("$SHA_CMD" -a 256 "$ROOT_DIR/$rel" 2>/dev/null || "$SHA_CMD" "$ROOT_DIR/$rel")"
  actual="${actual%% *}"
  if [ "$actual" != "$expected" ]; then
    echo "   SHA-256 NON CORRISPONDENTE: $rel" >&2
    echo "     atteso:  $expected" >&2
    echo "     trovato: $actual" >&2
    fail=1
  fi
done < "$ROOT_DIR/patches/CHECKSUMS.txt"

if [ $fail -ne 0 ]; then
  echo "bootstrap.sh: COMPLETATO CON ERRORI." >&2
  exit 1
fi

echo "==> Progetto Reloc localizzato in italiano pronto in: $ROOT_DIR"
echo "    Prossimi passi:"
echo "      xcodegen generate"
echo "      xcodebuild build -project Reloc.xcodeproj -scheme Reloc -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO"
