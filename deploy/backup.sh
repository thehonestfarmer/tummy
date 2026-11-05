#!/usr/bin/env bash
# Weekly dump of Tummy's database to the VPS, keeping the last 8
# (healthspec.md §3). Months of intake and lift history are hard to recreate;
# there are no blobs to back up. Run by cron as the deploy user.
#
# Restore into an empty database with:
#   docker run --rm -i postgres:18-alpine pg_restore --no-owner -d "$URL" < backups/<file>.dump
set -euo pipefail
cd "$(dirname "$0")"

url=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
mkdir -p backups
out="backups/tummy-$(date -u +%Y%m%d).dump"

# pg_dump has to be at least the server's major version; Neon's is 17 or 18.
docker run --rm postgres:18-alpine pg_dump --format=custom --no-owner "$url" > "$out.tmp"
mv "$out.tmp" "$out"
ls -1t backups/tummy-*.dump | tail -n +9 | xargs -r rm --
echo "$(date -u +%FT%TZ) backed up $(du -h "$out" | cut -f1) to $out"
