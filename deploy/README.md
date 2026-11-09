# Deploying Tummy

Everything runs on one 1 vCPU / 1 GB VPS in Tokyo: Postgres, the app, and
Caddy in front for HTTPS (healthspec.md §3). The database is backed up daily
to Cloudflare R2, and a weekly check proves the newest backup restores.
GitHub Actions builds and smoke-tests the image on every push to `main`;
once the VPS is configured, the same run deploys it.

## 1. Cloudflare R2

1. Create a bucket, e.g. `tummy-backups`. The location can be Asia-Pacific.
2. Create an **R2 API token** with **Object Read & Write** on that bucket only.
   Note the access key id, the secret, and your account id (it's in the
   bucket's S3 endpoint: `https://<account id>.r2.cloudflarestorage.com`).

Dumps are kept 90 days in R2 (`backup.sh` prunes older ones) and 7 days on
the box. They're small: two people's log plus the MEXT table.

## 2. The VPS

Ubuntu 24.04, amd64, in Tokyo. (For an ARM box, change both `platforms` in
`.github/workflows/deploy.yml`.)

1. Put your SSH key on root, then run the setup once:

   ```sh
   ssh root@<vps> 'bash -s' < deploy/bootstrap.sh
   ```

   It installs Docker, creates the `deploy` user with your key, turns off
   password logins, opens only 22/80/443, adds 2 GB of swap, and makes
   `/srv/tummy`.

2. As `deploy@<vps>`, create `/srv/tummy/.env` (no quotes needed). Make the
   two secrets long and random, in hex so they are safe inside a URL:
   `openssl rand -hex 32`:

   ```sh
   DOMAIN=tummy.example.com
   POSTGRES_PASSWORD=<random>
   SESSION_SECRET=<random>
   ANTHROPIC_API_KEY=...
   GROQ_API_KEY=...
   GEMINI_API_KEY=...
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=tummy-backups
   ```

   `DATABASE_URL` is not set here: `compose.yaml` builds it from
   `POSTGRES_PASSWORD`. Optional: `HEALTH_VISION_MODEL`,
   `HEALTH_VISION_COMPARE`, `HEALTH_TEXT_MODEL`, `GROQ_PARSE_MODEL`,
   `GROQ_WHISPER_MODEL` (see `.env.example`).

3. Point the domain's A record at the VPS. Caddy gets the certificate on
   first start.

## 3. GitHub

In the repo's Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | The VPS's address |
| Secret | `DEPLOY_SSH_KEY` | A private key made for this, whose public half (`deploy/github-deploy.pub`) is in `/home/deploy/.ssh/authorized_keys` |
| Secret | `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan <vps>` |

Then re-run the latest workflow, or push. Each deploy copies the files in
this folder to `/srv/tummy`, starts Postgres, runs migrations from the new
image, starts the app, and installs the crontab.

## 4. Seed it, once

The database only listens on the box itself, so seed it from your Mac
through an SSH tunnel:

```sh
ssh -N -L 5433:127.0.0.1:5432 deploy@<vps> &
DATABASE_URL='postgres://tummy:<POSTGRES_PASSWORD>@localhost:5433/tummy' \
  SESSION_SECRET='<same as on the box>' bun run setup
kill %1
```

That seeds both users, their starting targets and guidance, and the MEXT
table. PINs are hashed with `SESSION_SECRET`, so it must be the box's.
`BUNNY_PIN` and `BEAR_PIN` come from your `.env.local`. Every seed step is
safe to run again.

Then take a first backup and check it restores:

```sh
ssh deploy@<vps> '/srv/tummy/backup.sh && /srv/tummy/restore-check.sh'
```

## Day to day

```sh
cd /srv/tummy
docker compose ps
docker compose logs -f app
TAG=<git sha> docker compose up -d       # roll back to an earlier build
./backup.sh                              # a backup now
./restore-check.sh                       # prove the newest one restores
./r2.sh ls r2:                           # what's in the bucket
tail backups/backup.log                  # how the nightly runs went
```

Cron, as `deploy`: the backup daily at 03:30 JST, the restore check on
Sundays, and a daily prune of review photos older than 30 days.

## Restoring

From the newest backup in R2, onto a fresh box after steps 2–3:

```sh
./r2.sh lsf r2:                                    # pick a file
./r2.sh copyto r2:<file> backups/<file>
docker compose up -d --wait db
docker compose exec -T db pg_restore -U tummy -d tummy --clean --if-exists --no-owner < backups/<file>
docker compose up -d
```

## Afterwards

Each of you opens Connect in the app and re-adds the connector link in Claude
(and ChatGPT), since the domain changed.
