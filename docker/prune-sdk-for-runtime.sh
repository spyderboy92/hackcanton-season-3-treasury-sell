#!/usr/bin/env bash
#
# Strip the dpm SDK down to what the Canton *runtime* container invokes, and
# nothing else. Run inside a build stage whose result is copied out with
# `COPY --from`, so the removed bytes never reach a shipped layer.
#
# The runtime does exactly two things: run Canton (the canton-open-source jar)
# and seed the demo with `dpm script` (the daml-script binary). It never
# compiles, so the compiler and its friends are ~1.1 GB of dead weight.
#
# The manifest matters as much as the tree: dpm validates every component the
# SDK manifest names before it runs any command, so pruning the tree alone
# fails the seed with
#   component "damlc:3.5.1" is currently not installed
# even though the seed never touches damlc.
set -Eeuo pipefail

SDK_VERSION="${DAML_SDK_VERSION:?DAML_SDK_VERSION must be set}"
DPM_ROOT="${DPM_ROOT:-/root/.dpm}"
COMPONENTS="$DPM_ROOT/cache/components"
MANIFEST="$DPM_ROOT/cache/sdk/open-source/$SDK_VERSION.yaml"

# Everything the runtime never calls. `dpm` itself and canton-open-source and
# daml-script stay.
DROP=(damlc codegen daml-new daml-shell scribe upgrade-check)

test -d "$COMPONENTS"
test -f "$MANIFEST"

echo "before: $(du -sh "$DPM_ROOT" | cut -f1)"

for name in "${DROP[@]}"; do
  rm -rf "${COMPONENTS:?}/$name"
done

# script-service.jar is a daml-script export used by damlc's in-IDE script
# runner, not by the `dpm script` CLI that seeds the ledger. ~216 MB. Its
# declaration in the component manifest goes with it, or every `dpm` call warns
# about an export path that does not exist.
rm -f "$COMPONENTS/daml-script/$SDK_VERSION/script-service.jar"
COMPONENT_YAML="$COMPONENTS/daml-script/$SDK_VERSION/component.yaml"
awk '
  # Any key at four spaces or less closes the block being skipped.
  /^ {0,4}[A-Za-z]/ { skip = 0 }
  /^    script-service:[[:space:]]*$/ { skip = 1 }
  !skip { print }
' "$COMPONENT_YAML" > "$COMPONENT_YAML.pruned"
grep -q 'jar-commands:' "$COMPONENT_YAML.pruned"
grep -q 'daml-script-binary_distribute.jar' "$COMPONENT_YAML.pruned"
! grep -q 'script-service' "$COMPONENT_YAML.pruned"
mv "$COMPONENT_YAML.pruned" "$COMPONENT_YAML"
echo "--- pruned daml-script component.yaml ---"
cat "$COMPONENT_YAML"

awk -v drop="${DROP[*]}" '
  BEGIN { n = split(drop, d, " ") }
  # A two-space-indented key ends whatever component block was open.
  /^  [A-Za-z]/ { skip = 0 }
  # A four-space-indented bare key names a component.
  /^    [A-Za-z][A-Za-z0-9-]*:[[:space:]]*$/ {
    name = $1; sub(":", "", name); skip = 0
    for (i = 1; i <= n; i++) if (name == d[i]) skip = 1
  }
  !skip { print }
' "$MANIFEST" > "$MANIFEST.pruned"

# Refuse to ship a manifest the pruning mangled.
grep -q 'canton-open-source:' "$MANIFEST.pruned"
grep -q 'daml-script:' "$MANIFEST.pruned"
grep -q 'assistant:' "$MANIFEST.pruned"
for name in "${DROP[@]}"; do
  if grep -q "^    $name:" "$MANIFEST.pruned"; then
    echo "FATAL: $name still in the manifest after pruning" >&2
    exit 1
  fi
done
mv "$MANIFEST.pruned" "$MANIFEST"

echo "--- pruned SDK manifest ---"
cat "$MANIFEST"
echo "after: $(du -sh "$DPM_ROOT" | cut -f1)"
