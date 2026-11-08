#!/usr/bin/env bash
# Build the /studio page assets from room-night.blend.
#
#   tools/studio/build.sh draft   quick look: fewer samples, a quarter of the pixels; the page shows "draft"
#   tools/studio/build.sh final   what ships (~18 min); don't view /studio while it renders, it jitters
#
# Save in Blender first: this reads the file from disk. Nothing here ever saves it.
set -euo pipefail

ALL_VARIANTS="base moon_off beam_off candle_off up_free up_off plants_a plants_b plants_c matte_a matte_b matte_c"
case "${1:-}" in
  draft) SPP=48 VARIANTS="$ALL_VARIANTS" ;;
  final) SPP=384 VARIANTS="ref $ALL_VARIANTS" ;;  # ref is only for comparing the page against Cycles
  *) echo "usage: tools/studio/build.sh draft|final" >&2; exit 2 ;;
esac
MODE=$1

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
SOURCE=/Users/rafey/Blender/room-night.blend  # studio_common.SOURCE_BLEND; the scripts refuse any other file
OUT="/Users/rafey/Blender/web-out/$MODE"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS="$REPO/tools/studio/blender"
export STUDIO_QUALITY="$MODE"  # read by studio_common: sets the plate size for export and render alike

# Blender is chatty; keep the pipeline's own lines and anything that went wrong
only_ours() { grep -E '^\[(export|render|post)\]|Error|Traceback|File "' || true; }

step() {
  local name=$1 started=$SECONDS
  shift
  "$@" 2>&1 | only_ours
  echo "  $name took $((SECONDS - started)) s"
}

before=$(shasum -a 256 "$SOURCE" | cut -d' ' -f1)
mkdir -p "$OUT"
echo "studio $MODE build: $SPP samples -> $OUT"

step export "$BLENDER" -b "$SOURCE" --python-exit-code 1 -P "$SCRIPTS/export.py" -- \
  --glb "$OUT/studio.glb" --facts "$OUT/scene.json"
# shellcheck disable=SC2086  # VARIANTS is a word list on purpose
step render "$BLENDER" -b "$SOURCE" --python-exit-code 1 -P "$SCRIPTS/render.py" -- \
  --variants $VARIANTS --spp "$SPP" --out "$OUT"
step postprocess "$BLENDER" -b --factory-startup --python-exit-code 1 -P "$SCRIPTS/postprocess.py" -- \
  --renders "$OUT"
cp "$OUT/studio.glb" "$REPO/public/studio/v1/studio.glb"

if [ "$(shasum -a 256 "$SOURCE" | cut -d' ' -f1)" != "$before" ]; then
  echo "WARNING: $SOURCE changed during the build (saved in Blender meanwhile?)" >&2
fi
echo "done in $((SECONDS / 60)) min $((SECONDS % 60)) s. Refresh /studio."
