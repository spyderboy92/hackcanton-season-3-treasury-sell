#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Private Treasury RFQ Daml/Canton project.
# Installs the dpm CLI, the project-pinned Daml SDK, and warms the multi-package build.
set -euo pipefail

export DPM_HOME="${DPM_HOME:-$HOME/.dpm}"

# 1. Install the dpm launcher once. The disk snapshot preserves ~/.dpm for later boots,
#    so this curl only runs on a cold machine.
if [ ! -x "$DPM_HOME/bin/dpm" ]; then
  echo "==> Installing dpm into $DPM_HOME"
  curl -sSf https://get.digitalasset.com/install/install.sh | sh
else
  echo "==> dpm already present in $DPM_HOME"
fi

# 2. Expose dpm on the default PATH via /usr/local/bin so every shell (login or not)
#    finds it without mutating shell profiles. dpm resolves its SDK from DPM_HOME.
if [ -w /usr/local/bin ]; then
  ln -sf "$DPM_HOME/bin/dpm" /usr/local/bin/dpm
else
  sudo ln -sf "$DPM_HOME/bin/dpm" /usr/local/bin/dpm
fi

export PATH="$DPM_HOME/bin:$PATH"

# 3. Install the SDK version pinned in multi-package.yaml / daml.yaml (3.5.1) plus
#    project dependencies. Idempotent: reports "already installed" on warm machines.
echo "==> Installing project-pinned Daml SDK and dependencies"
dpm install

# 4. Warm the multi-package build so the DARs in .daml/dist/ (including the
#    treasury-rfq DAR that treasury-rfq-tests data-depends on) are ready to use.
echo "==> Building all Daml packages"
dpm build --all

echo "==> Cloud Agent bootstrap complete"
dpm version --active
