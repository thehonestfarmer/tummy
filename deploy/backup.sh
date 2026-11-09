#!/usr/bin/env bash
# Daily dump of Tummy's database, kept for a week on the box and for 90 days
# in Cloudflare R2 (healthspec.md §3). The database lives on this box, so a
# backup that stayed here would go down with it. There are no blobs: review
# photos are transient. Run by cron as the deploy user.
#
# Restore into an empty database with:
#   docker compose exec -T db pg_restore -U tummy -d tummy --clean --if-exists --no-owner < backups/<file>.dump
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p backups
out="backups/tummy-$(date -u +%Y%m%d).dump"

docker compose exec -T db pg_dump -U tummy --format=custom --no-owner tummy > "$out.tmp"
mv "$out.tmp" "$out"
ls -1t backups/tummy-*.dump | tail -n +8 | xargs -r rm --

./r2.sh copy "$out" r2:
./r2.sh delete --min-age 90d r2:
echo "$(date -u +%FT%TZ) backed up $(du -h "$out" | cut -f1) to $out and R2"
