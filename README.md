# Tummy

What Bunny and Bear eat, against a calorie and macro target, logged by voice
in a couple of seconds. A PWA for two people, plus an MCP connector so Claude
and ChatGPT can log and look things up too.

Read `healthspec.md` for the product and `mcpspec.md` for the connector.
`ARCHITECTURE.md` describes Bunnybear, the photo app this one copies its
patterns from.

## Running it locally

Needs Bun and a local Postgres.

```sh
createdb tummy
cp .env.example .env.local   # fill in the PINs, SESSION_SECRET and API keys
bun install
bun run setup                # migrate, seed both users and targets, load MEXT
bun run dev
```

The mic needs HTTPS, so it won't work over the LAN dev URL. Type a sentence
into quick log instead, or test voice through a tunnel.

Food photos waiting for review go to `./data/photos` (or `PHOTO_DIR`). They
are deleted when their draft is confirmed or discarded.

## The production build

`next.config.ts` sets `output: "standalone"`, so `bun run build` produces a
self-contained server in `.next/standalone`. It needs `public/` and
`.next/static/` copied in beside it:

```sh
bun run build
cp -R public .next/standalone/
cp -R .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js
```

## The reference table

Anything without a label (loose produce, meat and fish packs, a food added
by name) takes its values from MEXT's 日本食品標準成分表 (八訂) 増補2023,
committed as `db/reference/mext-2023.csv` and loaded into `reference_foods`.
Data: 文部科学省「日本食品標準成分表（八訂）増補2023年」, used under MEXT's
terms of use (compatible with CC BY 4.0). `bun run setup` loads it locally;
against a hosted database, run it like `migrate`:

```sh
DATABASE_URL='<connection string>' bun run seed:reference
```

To refresh it after MEXT publishes an update, download the 第2章 Excel file
and run `bun scripts/reference-csv.ts <file>`.

## Picking the vision model

Every photo draft is read by `HEALTH_VISION_MODEL` and each model in
`HEALTH_VISION_COMPARE`. After the first seeding batch, score them against
what was confirmed:

```sh
bun run vision:compare   # writes docs/vision-comparison.md
```

## Scripts

| | |
|---|---|
| `bun run migrate` | Apply `db/migrations/*.sql` in order |
| `bun run seed` | Both users (from `BUNNY_PIN`, `BEAR_PIN`) and their starting targets |
| `bun run seed:reference` | Load the MEXT table |
| `bun run vision:compare` | Score the vision models |
| `bun run lint`, `bunx tsc --noEmit` | Checks |
