#!/usr/bin/env bash
# Proves the newest backup in R2 actually restores (healthspec.md §3): pulls
# it down, restores it into a throwaway Postgres, and compares row counts
# with the live database. A backup nobody has restored is a hope, not a
# backup. Run weekly by cron; the last line says OK or what didn't match.
set -euo pipefail
cd "$(dirname "$0")"

latest=$(./r2.sh lsf r2: | grep '^tummy-.*\.dump$' | sort | tail -1)
[ -n "$latest" ] || { echo "$(date -u +%FT%TZ) FAIL: no backups in R2"; exit 1; }
mkdir -p backups/check
./r2.sh copyto "r2:$latest" "backups/check/$latest"

name=tummy-restore-check
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf backups/check' EXIT
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=check postgres:18-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres -d check >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$name" pg_restore -U postgres -d check --no-owner < "backups/check/$latest"

# A restore that ran is half the proof; the other half is that the data came
# with it. These are never empty once the app is set up. Live counts can
# differ either way (a day of logging, or a deletion), so they're shown, not
# compared.
counts=""
problems=""
for t in users targets guidance reference_foods foods food_entries; do
  restored=$(docker exec "$name" psql -U postgres -d check -tAc "select count(*) from $t")
  live=$(docker compose exec -T db psql -U tummy -d tummy -tAc "select count(*) from $t")
  counts+=" $t=$restored/$live"
  case $t in users|targets|guidance|reference_foods) [ "$restored" -gt 0 ] || problems+=" $t" ;; esac
done

if [ -n "$problems" ]; then
  echo "$(date -u +%FT%TZ) FAIL: $latest restored with empty tables:$problems (restored/live:$counts)"
  exit 1
fi
echo "$(date -u +%FT%TZ) OK: $latest restores (restored/live:$counts)"
