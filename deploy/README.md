# Deploying Tummy

One Docker container behind Caddy, on a 1 vCPU / 1 GB VPS in Singapore, with
the database on Neon (healthspec.md §3). GitHub Actions builds the image on
every push to `main`; once the VPS is configured, the same run deploys it.

## 1. Neon

1. Create a **new project** in **AWS Asia Pacific (Singapore)**.
2. Copy the **direct** connection string, not the pooled one. The app is one
   long-lived process holding at most 5 connections, so it doesn't need
   PgBouncer.
3. From your Mac, in the repo, create the tables and load everything else:

   ```sh
   DATABASE_URL='<direct url>' SESSION_SECRET='<production secret>' bun run setup
   ```

   That migrates, seeds both users and their targets, and loads the MEXT table.
   PINs are hashed with `SESSION_SECRET`, so it must be the one the server will
   use. `BUNNY_PIN` and `BEAR_PIN` come from `.env.local`.

## 2. The VPS

Ubuntu 24.04, amd64. (For an ARM box, change `platforms` in
`.github/workflows/deploy.yml`.)

1. Put your SSH key on root, then run the setup once:

   ```sh
   ssh root@<vps> 'bash -s' < deploy/bootstrap.sh
   ```

   It installs Docker, creates the `deploy` user with your key, turns off
   password logins, opens only 22/80/443, adds 2 GB of swap, and makes
   `/srv/tummy`.

2. As `deploy@<vps>`, create `/srv/tummy/.env` (no quotes needed):

   ```sh
   DOMAIN=tummy.example.com
   DATABASE_URL=<neon direct url>
   SESSION_SECRET=<same as used for seeding>
   ANTHROPIC_API_KEY=...
   GROQ_API_KEY=...
   GEMINI_API_KEY=...
   ```

   Optional: `HEALTH_VISION_MODEL`, `HEALTH_VISION_COMPARE`, `HEALTH_TEXT_MODEL`,
   `GROQ_PARSE_MODEL`, `GROQ_WHISPER_MODEL` (see `.env.example`).

3. Point the domain's A record at the VPS. Caddy gets the certificate on first
   start.

## 3. GitHub

In the repo's Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | The VPS's address |
| Secret | `DEPLOY_SSH_KEY` | A private key made for this, whose public half is in `/home/deploy/.ssh/authorized_keys` |
| Secret | `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan <vps>` |

Then re-run the latest workflow, or push. Each deploy copies `compose.yaml`,
`Caddyfile`, `backup.sh` and `crontab` to `/srv/tummy`, runs migrations from the
new image, starts it, and installs the crontab.

## Day to day

```sh
cd /srv/tummy
docker compose ps
docker compose logs -f app
TAG=<git sha> docker compose up -d       # roll back to an earlier build
./backup.sh                              # a backup now
```

Cron, as `deploy`: a weekly `pg_dump` to `/srv/tummy/backups` (last 8 kept), and
a daily prune of review photos older than 30 days. A Neon keep-alive is in the
crontab but off; see the note there.

## Afterwards

Each of you opens Connect in the app and re-adds the connector link in Claude
(and ChatGPT), since the domain changed.
