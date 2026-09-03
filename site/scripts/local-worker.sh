#!/usr/bin/env bash
# Start the built worker for the render replays, persisting local D1/KV OUTSIDE
# the build output.
#
# The whole point: `wrangler dev` defaults --persist-to to `.wrangler/state`
# RELATIVE TO CWD, and this worker runs from dist/server, so state used to land
# in Astro's output directory and `npm run build` deleted it every time. Always
# start the worker through this script, never with a bare `wrangler dev` from
# dist/server.
set -euo pipefail
SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$SITE/.wrangler/state"          # gitignored; survives npm run build
PORT="${PORT:-9400}"

if [ ! -f "$SITE/dist/server/wrangler.json" ]; then
  echo "no build found - run 'npm run build' first" >&2; exit 1
fi
case "$STATE" in
  "$SITE"/dist/*) echo "refusing: state dir is inside dist/" >&2; exit 1 ;;
esac

# r9render's unsubscribe section calls /api/email/weekly-run/, which 404s
# without these two. They are LOCAL TEST values, not secrets - but .dev.vars is
# gitignored, so say what is missing rather than letting a replay fail opaquely.
if [ ! -f "$SITE/.dev.vars" ]; then
  echo "note: no site/.dev.vars - EMAIL_LINK_SIGNING_KEY and WEEKLY_RUN_TOKEN are unset." >&2
  echo "      Everything runs except r9render's unsubscribe section, which needs them." >&2
fi

mkdir -p "$STATE"
cd "$SITE/dist/server"
exec npx wrangler dev --config wrangler.json --local --persist-to "$STATE" --port "$PORT" "$@"
