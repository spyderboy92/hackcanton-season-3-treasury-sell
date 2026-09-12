#!/usr/bin/env bash
#
# Canton service entrypoint. In order: start the sandbox, wait until it really
# accepts connections, seed the demo scenario, then hand the healthcheck a
# marker. A sandbox that is up but unseeded serves an empty ACS, which makes the
# UI look broken — so "healthy" has to mean "seeded", not merely "listening".
#
# The sandbox is launched as `canton daemon` over the SDK's own sandbox.conf
# rather than as `dpm sandbox`. Same nodes, same ports, same config file; the
# difference is that `canton sandbox` refuses `--bootstrap`, and its built-in
# bootstrap cannot run twice against persisted state (it re-proposes a topology
# mapping that already exists). See the comment in Dockerfile.canton.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/treasury-rfq}"
STATE_DIR="${CANTON_STATE_DIR:-/var/lib/canton}"
RUN_DIR="${CANTON_RUN_DIR:-/run/canton}"
DAR="${SEED_DAR:-$APP_DIR/dar/treasury-rfq-tests-0.0.1.dar}"
SEED_SCRIPT="${SEED_SCRIPT:-Demo.Bootstrap:bootstrap}"
START_TIMEOUT="${CANTON_START_TIMEOUT:-300}"

# Lives in the named volume: `docker compose down` keeps it, `down -v` wipes it
# together with the H2 files. That coupling is the point — a surviving marker
# beside a wiped ledger would leave the UI staring at an empty ACS.
SEED_MARKER="$STATE_DIR/.seeded"
# Recreated on every container start: it means "this process is ready now".
READY_MARKER="$RUN_DIR/ready"

mkdir -p "$STATE_DIR" "$RUN_DIR"
rm -f "$READY_MARKER"

log() { printf '[canton] %s\n' "$*"; }

# Canton's output goes to the container log as usual and, through the tee, to a
# file the readiness gate below can grep. Process substitution keeps $! as the
# JVM's pid rather than tee's, which matters for signal forwarding.
CANTON_LOG="$RUN_DIR/canton.log"
: > "$CANTON_LOG"

log "starting Canton sandbox (state: $STATE_DIR)"
java -jar "$CANTON_JAR" daemon --no-tty \
  -c "$APP_DIR/sandbox/sandbox.conf" \
  -c "$APP_DIR/canton-container.conf" \
  --bootstrap "$APP_DIR/sandbox/bootstrap.canton" \
  > >(tee -a "$CANTON_LOG") 2>&1 &
SANDBOX_PID=$!

# Compose sends SIGTERM to PID 1; forward it so Canton shuts down cleanly and
# leaves the H2 files consistent for the next start.
forward() { kill -TERM "$SANDBOX_PID" 2>/dev/null || true; }
trap forward TERM INT

# Two gates, and the second one is the one that matters. The JSON Ledger API
# starts answering /v2/version well before the participant has connected to the
# synchronizer, and seeding into that window dies with
# PACKAGE_SERVICE_CANNOT_AUTODETECT_SYNCHRONIZER. "Canton sandbox is ready." is
# the last line of the bootstrap script, printed only after every participant
# has run connect_local.
deadline=$(( SECONDS + START_TIMEOUT ))

wait_for() {
  local what="$1"; shift
  log "waiting for $what"
  until "$@"; do
    if ! kill -0 "$SANDBOX_PID" 2>/dev/null; then
      log "sandbox exited while waiting for $what"
      wait "$SANDBOX_PID" || true
      exit 1
    fi
    if (( SECONDS >= deadline )); then
      log "timed out after ${START_TIMEOUT}s waiting for $what"
      exit 1
    fi
    sleep 1
  done
  log "$what: ok"
}

wait_for "the JSON Ledger API on 6864" \
  curl -fsS -o /dev/null http://127.0.0.1:6864/v2/version
wait_for "the participant to connect to the synchronizer" \
  grep -q "Canton sandbox is ready." "$CANTON_LOG"

if [[ -f "$SEED_MARKER" ]]; then
  log "ledger volume already seeded at $(cat "$SEED_MARKER"); skipping Demo.Bootstrap"
else
  log "seeding: $SEED_SCRIPT"
  # Retried: the readiness gates above are sound, but a first submission can
  # still land a moment before the ledger will accept it, and a demo that has
  # to be started twice is not one command.
  seeded=0
  for attempt in 1 2 3 4 5; do
    if dpm script \
         --dar "$DAR" \
         --script-name "$SEED_SCRIPT" \
         --ledger-host 127.0.0.1 --ledger-port 6865 \
         --upload-dar true -w
    then
      seeded=1
      break
    fi
    log "seed attempt $attempt failed; retrying in 5s"
    sleep 5
  done
  if (( seeded == 0 )); then
    log "seeding failed after 5 attempts"
    exit 1
  fi
  date -u +%Y-%m-%dT%H:%M:%SZ > "$SEED_MARKER"
  log "seed complete"
fi

touch "$READY_MARKER"
log "ready — 6864 (JSON Ledger API), 6865 (gRPC Ledger API)"

wait "$SANDBOX_PID"
