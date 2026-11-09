#!/usr/bin/env bash
# rclone against Tummy's Cloudflare R2 bucket, configured from .env, with
# nothing installed on the box. Arguments go to rclone; `r2:` means the
# bucket itself and `r2:path` a path inside it:
#
#   ./r2.sh ls r2:
#   ./r2.sh copy backups/tummy-20261110.dump r2:
set -euo pipefail
cd "$(dirname "$0")"

env_of() { grep "^$1=" .env | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
bucket=$(env_of R2_BUCKET)
args=()
for a in "$@"; do
  if [[ $a == r2:* ]]; then args+=("r2:$bucket/${a#r2:}"); else args+=("$a"); fi
done

exec docker run --rm -v "$PWD/backups:/work/backups" -w /work \
  -e RCLONE_CONFIG_R2_TYPE=s3 \
  -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(env_of R2_ACCESS_KEY_ID)" \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(env_of R2_SECRET_ACCESS_KEY)" \
  -e RCLONE_CONFIG_R2_ENDPOINT="https://$(env_of R2_ACCOUNT_ID).r2.cloudflarestorage.com" \
  -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  -e RCLONE_CONFIG=/dev/null \
  rclone/rclone:1 --quiet "${args[@]}"
