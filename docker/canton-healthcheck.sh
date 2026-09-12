#!/usr/bin/env bash
# Healthy means both halves are true: the JSON Ledger API answers, AND the
# entrypoint finished seeding. Either alone is a lie to `depends_on`.
set -euo pipefail
[[ -f "${CANTON_RUN_DIR:-/run/canton}/ready" ]]
curl -fsS -o /dev/null http://127.0.0.1:6864/v2/version
