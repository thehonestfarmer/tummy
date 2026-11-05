# Bunnybear — architecture

How the app is actually built today, as of 2026-10-26 (commit `d9908b8`). Written
for an agent that has to spec a new mode, a nutrition and workout tracker for the
same two people, on top of this codebase. It describes what exists. It does not
propose anything.

**Trust the code over `tigerbearspec.md`.** That file is the original v1 build
spec, and the app has moved past it in several places (see §12).

---

## 1. What the app is

A private PWA for exactly two people, **Bunny** (user 1) and **Bear** (user 2). It
has three tabs and one standalone page:

| Surface | Route | What it does |
|---|---|---|
| Enter | `/` | 4-digit PIN pad. The PIN identifies the user. |
| Today | `/today` | Each person posts up to 5 photos a day. The partner's photos stay "undeveloped" until both of you have posted **and** it is past 18:00 JST. It also has two one-tap signals, "I love you" and "I miss you", which send a web push. |
| Archive | `/archive` | Past days in reverse order, each shown as a Bunny/Bear diptych, with that day's completed question rounds interleaved. |
| Questions | `/questions` | A shared deck. Either person draws a question, both write answers at the same time, the answers reveal once both are in, then either one finishes the round. |
| Letter | `/letter` | A static markdown letter, linked from the header rather than the tab bar. It is the only content cached for offline use. |

The product is built around a pair: two sides, always in the same order (Bunny,
then Bear), one per person.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3.5**, App Router, React 19.2 | `AGENTS.md`: this Next has breaking changes from training data. Read `node_modules/next/dist/docs/` before writing code. |
| Language | TypeScript 5, strict | Path alias `@/*` → `src/*`. |
| Runtime / pkg manager | **Bun 1.4.2** (`packageManager` pinned) | `bun install --frozen-lockfile` on Vercel. `bun test` for tests. Scripts run under `node`. |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | Tokens live in `src/app/globals.css` (`:root` + `@theme inline`). No component library. |
| Database | Postgres. **Neon** in prod (via the Vercel integration), local Postgres 17 in dev | Driver: `postgres` (porsager) with tagged-template SQL. No ORM, no query builder. `@neondatabase/serverless` is installed but unused by app code. |
| Files | **Vercel Blob**, public access | Falls back to `public/uploads/` in local dev. |
| Push | `web-push` with VAPID | Subscriptions are stored per device. |
| Hosting | Vercel, functions pinned to **`sin1`** (Singapore, next to the DB) | `vercel.json` |
| Cron | Vercel Cron, `5 15 * * *` UTC = 00:05 JST | `/api/cron/daily` |
| Markdown | `marked`, server-only | Used only for the letter. |
| Fonts | `next/font/google`: **Nunito** (UI), **Caveat** (letter sign-off only) | |

There are no other runtime dependencies: no state library, no data-fetching
library, no date library, no form library, no charting, no validation library.

---

## 3. Directory map

```
db/migrations/NNN_name.sql   Plain SQL, applied in filename order (001–007 exist)
scripts/                     migrate.mjs, seed.mjs, env.mjs (.env loader), sql.mjs (connect)
questions.json               Question deck seed (~168 items: id, text, category)
public/                      manifest.webmanifest, icons/, offline.html (flat, no build)
src/
  instrumentation.ts         Boot check: warns if no Blob store on Vercel
  app/
    layout.tsx               Root: fonts, metadata, viewport, manifest
    page.tsx                 PIN pad; signed in, redirects to the last-used mode (tb_mode cookie)
    globals.css              Design tokens + a few global classes (.grain, .letter-*)
    (app)/layout.tsx         Auth gate + chrome: header, main, BottomChrome (tab bar)
    (app)/{today,archive,questions,letter}/page.tsx
    api/…/route.ts           JSON route handlers (see §6)
  lib/                       Domain + infra modules (server-only unless noted)
  components/                Client and server components, flat folder
  content/letter.md          The letter
```

---

## 4. Request and rendering model

The same pattern repeats on every tab:

1. **The page is a server component**, marked `export const dynamic = "force-dynamic"`.
   It calls `getUser()`, redirects to `/` when there is no user, then calls a
   domain function (`getToday`, `getArchive`, `getQuestionState`) directly. It
   does not go through HTTP.
2. **It hands the result to a `*Client` component** as `initial`
   (`TodayClient`, `QuestionsClient`).
3. **The client keeps itself fresh with `usePoll(url, intervalMs, initial)`**
   (`src/lib/usePoll.ts`). It refetches on mount, on `visibilitychange`, on an
   interval while the tab is visible (Today 15s, Questions 5s), and whenever
   something dispatches `window` event `tb:poll-now`.
4. **Mutations are `fetch` POSTs to `/api/...`**. Every mutation returns the
   **entire refreshed view model**, and the client swaps it in with `setData`.
   There are no optimistic partial merges and no client cache.
5. **There are no Server Actions.** Every write goes through a route handler.

`(app)/layout.tsx` is also force-dynamic. It gates auth and renders
`AppHeader`, `<main>` and `BottomChrome`. `BottomChrome` holds the dev strip and
`TabBar`, and publishes its measured height as `--bottom-chrome` so that `main`
can pad for it.

The **view models are plain TS types exported from `lib/`** (`DayView`, `Side`,
`QuestionView`, `MissView`, `ArchiveEntry`). Server code builds them. Clients
import only the types.

---

## 5. Auth and identity (`src/lib/auth.ts`)

- The `users` table has exactly two seeded rows: `slug in ('bunny','bear')`,
  `display_name`, and `pin_hash`.
- `pin_hash = HMAC-SHA256(SESSION_SECRET, pin)`. It is deterministic on purpose,
  so that `unique(pin_hash)` can enforce distinct PINs.
- The session cookie `tb_session` is `"<userId>.<hmac(userId)>"`. It is
  httpOnly, SameSite=Lax, valid for 1 year, and `secure` only in production.
- `getUser()` reads the cookie and returns `User { id, slug, displayName }` or
  null. `bothUsers()` returns `Record<Slug, User>`.
- **"Partner" is always derived** as the other one of the two:
  `PAIR_ORDER.map(s => users[s]).find(u => u.id !== me.id)`. No relationship
  table exists, and none is needed.
- `withUser(handler)` (`src/lib/api.ts`) is the wrapper used by every
  authenticated API route. It returns 401 when there is no session, JSON for a
  normal return, and **400 with `{error: err.message}`** when the handler
  throws. Domain functions throw `Error`s with **user-facing copy** ("That's all
  5 for today."), and the client shows those messages as-is.
- **Security posture:** two private users. Hardening (rate limits, CSRF,
  brute-force protection) is deliberately out of scope.

---

## 6. API surface

| Method & path | Auth | Purpose / returns |
|---|---|---|
| `POST /api/auth/pin` | — | `{pin}` → sets cookie → `{slug, displayName}` |
| `POST /api/auth/logout` | — | Clears cookie |
| `GET /api/me` | user | `{slug, displayName}` |
| `GET /api/warm` | — | `select 1`. The PIN pad calls it on mount so the function and Neon are warm by the time the PIN is entered. |
| `GET /api/today` | user | `DayView` |
| `POST /api/photos` | user | JSON (client-upload confirm: `{url,width,height,takenAt,thumb,caption}`) **or** multipart (`file,…`) → writes the row → `DayView` |
| `POST /api/photos/upload` | user | `@vercel/blob/client` `handleUpload` token mint. Enforces the daily cap *before* issuing a token. |
| `GET /api/archive` | user | `{days: ArchiveEntry[]}` |
| `GET /api/questions` | user | `QuestionView` |
| `POST /api/questions/action` | user | `{action: draw\|submit\|finish\|skip\|abandon, body?}` → `QuestionView` |
| `POST /api/miss` | user | `{kind: love\|miss}` → `MissView` (also pushes to the partner) |
| `GET /api/push` | optional | `{publicKey, devices}` |
| `POST /api/push` | user | `{action: subscribe\|unsubscribe\|report, endpoint, keys, reason}` |
| `GET /api/cron/daily` | `Bearer CRON_SECRET` | Ensures today's `days` row |
| `GET/POST /api/dev/session` | dev flag | Test tools: `clear`, `switch` (become partner), `gate` (move today's reveal across now), `wipe` (delete my photos and blobs). Returns 404 unless `sessionToolsEnabled()`. |

Route handlers are thin. They parse the body loosely
(`await req.json().catch(() => ({}))`), validate shapes inline with small
`parseX(raw: unknown)` helpers, and delegate to `lib/`.

---

## 7. Data model

Current schema after migrations 001–007. `_migrations(name, run_at)` tracks
which ones have been applied.

```
users                id serial, slug unique ('bunny'|'bear'), display_name, pin_hash unique, created_at

days                 id, date date unique (anchor-tz calendar date), reveal_time timestamptz
photos               id, day_id→days, user_id→users, blob_url, width, height,
                     posted_at timestamptz, taken_at timestamp (naive EXIF wall clock, nullable),
                     preview text (~24px JPEG data URL, ≤8KB), caption text (≤140)
                     idx (day_id, user_id), idx (day_id)

questions            id, ext_id unique, text, category
question_rounds      id, question_id, drawn_at, completed_at (null = open)
                     unique partial index: at most ONE open round  ((true)) where completed_at is null
question_answers     id, round_id, user_id, body (≤2000), submitted_at, unique(round_id, user_id)
completed_questions  id, question_id, completed_at   -- the "drawn" set; cleared when deck exhausts
active_question      LEGACY singleton from the old turn-based flow. Unread. Left for a later drop.

misses               id, sender_id, kind ('love'|'miss'), sent_at   -- signals; only today's are read
push_subscriptions   id, user_id, endpoint unique, p256dh, auth, created_at   -- one row per device
```

### Data conventions to preserve

- **Derive state; never store a status column.** Day state
  (`closed`/`waiting_partner`/`waiting_reveal`/`revealed`) comes from the photo
  rows and `reveal_time` on every read (`deriveState` in `lib/day.ts`). Question
  state (`idle`/`answering`/`revealed`) comes from whether a round is open and
  how many answers it has. Signals "clear each morning" because only today's
  rows are queried.
- **Use DB constraints instead of app-level invariants** wherever possible: the
  partial unique index for a single open round, `unique(round_id,user_id)`, and
  `unique(pin_hash)`.
- **Concurrent writes between the two users** go inside
  `sql.begin(tx => ...)` with `select ... for update` (see `lib/questions.ts`).
- **Content is immutable once submitted.** Photos and answers can't be edited
  or deleted in the product; only the dev tools can wipe. A caption can only be
  set at upload time.
- **Historical rows carry their own rules.** `days.reveal_time` is stored per
  row, so changing the configured hour never rewrites the past.
- **Days are lazily created.** `getOrCreateDay(date)` upserts on read, and the
  cron is only a safety net.
- **Migrations are additive and deploy-safe.** They use
  `create … if not exists` and `add column if not exists`, and wrap constraints
  in `do $$ … exception when duplicate_object`. A migration has to be safe to
  apply *before* the code that uses it deploys. It is run manually from a laptop
  against Neon's **unpooled** URL (README "Migrating a hosted database"). The
  next file would be `008_*.sql`.
- Each migration file opens with a comment block explaining *why* the change
  exists.

---

## 8. Time

- `ANCHOR_TZ = "Asia/Tokyo"` is app-wide (`lib/config.ts`). Both users share this
  one clock wherever they physically are (they travel between JP, KR and TW). A
  "day" is the Tokyo calendar date.
- `lib/time.ts`: `anchorDate(at)` returns `YYYY-MM-DD` in the anchor zone, and
  `revealTimeUtc(date)` builds the timestamp from a fixed `+09:00` offset (JST
  has no DST). Formatters (`formatDayLong`, `formatDayShort`, `formatYear`,
  `formatRevealClock`) use `Intl` with `en-GB` style.
- SQL bucketing by day uses `(ts at time zone 'Asia/Tokyo')::date` and
  `to_char(... at time zone ..., 'HH24:MI')` for display clocks.
- `photos.taken_at` is a deliberately naive `timestamp`: the EXIF wall clock,
  with no offset.

---

## 9. Media pipeline

1. A file input (`accept="image/*"`, multi-select, no `getUserMedia`) feeds
   `prepare(file)` in `lib/resize.ts` (client). That function:
   - reads EXIF `DateTimeOriginal` from the original bytes (hand-rolled reader
     in `lib/exif.ts`, the only unit-tested module);
   - redraws the image through a canvas, with the longest edge capped at
     2000px, JPEG quality 0.85. This also strips EXIF and GPS;
   - produces a ~24px `thumb` data URL.
2. Upload transport is chosen by the server-reported `uploadMode`
   (`lib/blob.ts`):
   - `client`: the browser uploads straight to Blob through `/api/photos/upload`
     (needs `BLOB_READ_WRITE_TOKEN`), then confirms the row with a JSON POST to
     `/api/photos`;
   - `server`: multipart through a function (OIDC-only store);
   - `local`: multipart, written to `public/uploads/`. Dev only; fatal on Vercel.
3. `/api/photos` accepts only URLs it recognises as its own
   (`isStoredPhotoUrl`), enforces the cap (`claimSlot`), inserts the row, and
   returns the new `DayView`.
4. **Withholding is server-side.** Before reveal, the partner's
   `Side.photos` is `null` and only `count` plus the tiny `previews` are sent.
   The real URLs never reach the client early.

---

## 10. Push and the service worker

- `lib/push.ts` provides `pushToUser(userId, {title, body, url?, tag?})`. It is
  **best-effort**: it never throws into the caller, and callers add
  `.catch(() => {})` anyway. It prunes dead subscriptions using the
  Apple/FCM-specific "gone" codes. The VAPID public key is served at runtime,
  not inlined at build time.
- Only `sendMiss` triggers pushes today. Notification `tag` collapses repeats,
  and `url` sets where a tap lands (default `/today`).
- `NotificationSetup` (a client component on Today) handles permission,
  subscribe, reconcile and failure reporting. iOS only allows push for
  **installed** PWAs.
- `src/lib/service-worker.js` is registered via
  `new URL("./service-worker.js", import.meta.url)` with scope `/`. Its caching
  is **narrow on purpose**:
  - `/letter` is network-first, with a cached fallback;
  - `/_next/static/*` is cache-first, because those files are content-hashed;
  - any other navigation is network-only and falls back to `/offline.html`
    (precached at install);
  - **no** API responses or app-tab HTML are cached. Live data is allowed to
    fail when offline instead of going stale.
- Never use browser storage for durable data: iOS evicts it after about 7 days
  of non-use. `localStorage` is used only for UI conveniences, such as
  dismissing the install hint.

---

## 11. UI system

- **One dark theme, committed.** Cool graphite ground, no light mode. Tokens:
  `--ground`, `--ground-raised`, `--ground-sunk`, `--hairline(-strong)`, `--ink`,
  `--ink-dim`, `--ink-faint`, and two identity colors, `--bunny: #c58f95` and
  `--bear: #8d9e85`. They are exposed to Tailwind as `bg-ground`,
  `text-ink-dim` and so on.
- `Mark` renders each person's glyph, in that person's color. `AppHeader`
  shows both marks, the `letter` link, the current user's name in their color,
  and sign-out.
- **Type:** Nunito throughout, small and quiet, with sizes set inline in rem
  (`text-[0.95rem]`). No all-caps, no tracked eyebrows, no monospace metadata.
  The question deck is the only place type is set large.
- **Motion:** essentially none. The single orchestrated animation is a photo
  side "developing" when it reveals (blur and grain fading out, ~1.5–2.2s).
- **Layout:** the column is `max-w-2xl`, centered. Safe areas come from
  `--safe-top` and `--safe-bottom`, and bottom chrome is measured, not assumed.
- **`TabBar` is a hard-coded array** of `{href,label}` (Today, Archive,
  Questions) and marks the active tab with `pathname.startsWith`.
- **Copy voice:** plain and specific, using the app's own names: "Waiting on
  Bear.", "Bunny added 3 today.", "Both in. Opens at 18:00." Empty states tell
  the user what to do. Copy avoids anything that becomes a streak or a guilt
  counter. For example, `TodayClient` intentionally shows no line on days nobody
  sent a signal.
- **Code comments** explain *why*, often at length, in full sentences, as
  JSDoc above functions or block comments in SQL. New code should match this
  density and voice.

---

## 11a. Health mode (in progress)

`healthspec.md` is the build spec; steps 1 to 4 are built, plus the food
tools of the MCP server (step 6).

- Routes under `src/app/(app)/health/` (Today, Library, Review, Add, Settings)
  and `src/app/api/health/`, plus `/api/mcp/[token]`. `(app)/health/layout.tsx`
  loads the day once; `HealthDayProvider` polls it and every Health screen
  (macro bar, Today, sheets) reads and replaces it. `TabBar` switches tab
  sets on `/health`; `ModeToggle` writes the `tb_mode` cookie that `/` uses.
- Domain code in `src/lib/health/`:
  - `reading.ts` (pure, shared with the client): the as-printed `Reading`,
    per-100g normalisation, servings, plausibility and table cross-checks.
  - `vision.ts`, `named.ts`, `claude.ts`: Claude reads labels and interprets
    foods named in words; `reference.ts` matches them to MEXT's table, which
    is loaded into `reference_foods` from `db/reference/`.
  - `foods.ts`: drafts, the review queue, the library.
  - `entries.ts`: the log, targets, the day view, shared meals, recents.
  - `parse.ts`, `groq.ts`, `quicklog.ts`: quick log (Groq Whisper and
    gpt-oss-20b; matching and amounts are deterministic server code).
  - `meals.ts`, `tokens.ts`, `mcp.ts`: saved meals, per-person secrets, and
    the MCP server built per request for the person the secret belongs to.
- Tables: `foods`, `food_servings`, `food_readings`, `reference_foods`
  (008–009); `targets`, `food_entries`, `pending_logs`, `shared_meals` (010);
  `saved_meals`, `saved_meal_items`, `users.api_token` (011). Entries snapshot
  their food's per-100g values; totals are derived on read.
- Health's day is the phone's own date: a `tb_tz` cookie set by `ZoneCookie`;
  requests without it (Siri, MCP) use the zone of the person's last log.
- Breaks conventions on purpose: foods and entries are editable, the app
  calls external models (`ANTHROPIC_API_KEY`, `GROQ_API_KEY`), and Health has
  its own time zone. New dependencies: `@anthropic-ai/sdk`, `zod`,
  `mcp-handler`, `@modelcontextprotocol/server`; `xlsx` (dev) for the table.

## 12. Where `tigerbearspec.md` is out of date

| Spec says | Code does |
|---|---|
| No captions | Captions at upload time (≤140 chars) |
| Turn-based questions with an "Answered" button and `active_question` | Simultaneous written answers in `question_rounds`/`question_answers`, revealed when both are in, then finished. `active_question` is dead. |
| No push notifications | Web push exists, for the love/miss signals only. Polling is still the primary sync. |
| No logout button | `SignOutButton` in the header, plus `/api/auth/logout` |
| Questions are independent of the archive | Completed rounds appear in the Archive under the date they were completed |
| — | Love/miss signals, the Letter page, offline fallback, partner previews |
| Step 9 (shake) and step 11 (weekly backup) | **Neither is built.** There is no backup job. |

---

## 13. Config and environment

`lib/config.ts` holds the app constants: `ANCHOR_TZ`, `REVEAL_HOUR_JST=18`,
`MAX_PHOTOS_PER_DAY=5`, `MAX_CAPTION_CHARS=140`, `MAX_ANSWER_CHARS=2000`,
`MAX_EDGE_PX=2000`, `JPEG_QUALITY=0.85`, `APP_NAME="Bunnybear"`,
`Slug`, and `PAIR_ORDER=["bunny","bear"]`.

Environment variables: `DATABASE_URL`, `SESSION_SECRET` (also keys the PIN
hashes; seed and deploy must agree), `BUNNY_PIN`/`BEAR_PIN` (seed only),
`CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID`, `VAPID_PUBLIC_KEY` (or
`NEXT_PUBLIC_…`), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DEV_SESSION_TOOLS`.
**No AI or LLM key exists today**, and nothing calls an external API apart from
Blob and push services.

Dev workflow: `bun run setup` (migrate + seed), then `bun run dev` (binds
0.0.0.0 so phones on the LAN can reach it; `allowedDevOrigins` covers the
private subnets). Testing both sides on one phone uses the dev strip.

Tests: only `lib/exif.test.ts` (`bun test`). There are no component or route
tests, no e2e tests, and no CI config in the repo.

---

## 14. Seams a new mode would touch

These are facts about the current shape, not recommendations.

- **Navigation:** `TabBar.TABS` is the only nav definition. Three tabs fill the
  bar, and the header has room for one more small text link (`letter` sits
  there). There is no mode concept, settings screen, or per-user preferences
  table yet.
- **Routes:** everything authenticated lives under `src/app/(app)/` and gets
  the auth gate and chrome automatically. A new route group or subtree would
  inherit `(app)/layout.tsx`.
- **The "day" primitive:** `days` is keyed on the Tokyo date and carries a
  photo-specific `reveal_time`. Other per-day data can join to `days.id` (as
  photos do) or bucket by `(ts at time zone ANCHOR_TZ)::date` (as signals and
  completed rounds do).
- **The archive** (`getArchive`) already merges two kinds of dated content
  (photo days and question rounds) into one timeline keyed by date. That is the
  existing pattern for adding a third kind.
- **The pair rendering:** `Diptych`/`PhotoStack` render two sides in
  `PAIR_ORDER`, each side holding `isMe`, `count` and an optional withheld
  payload. Withholding and reveal semantics are photo-specific.
- **Uploads:** `prepare()` plus the three-mode Blob path is reusable for any
  image. Blob keys are currently `photos/...`. `isStoredPhotoUrl` checks the
  host and the local path shape.
- **Notifications:** `pushToUser` is generic. Nothing schedules a push today:
  the only cron is daily day-row creation. The Vercel plan isn't recorded in the
  repo, and it determines how often crons are allowed to run.
- **Mutability:** photos and answers are write-once on principle. Data that has
  to be editable after the fact would be a new convention for this codebase.
- **Units, locale, numbers:** the app has no numeric input, units, charts, or
  aggregation anywhere yet. Every view model is computed per request with plain
  SQL plus JS grouping.
- **Region and latency:** the functions and the DB are both in Singapore, and
  the users are on Asian mobile networks. `/api/warm` exists because Neon
  scale-to-zero cold starts were noticeable.
