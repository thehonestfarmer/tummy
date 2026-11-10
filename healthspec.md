# Tummy — build spec

*(Name, icon and address are settled: **Tummy**, a dumbbell resting on a rice bowl, at **https://tummy.habitnpc.com**. iOS fixes all three at "Add to Home Screen", so changing any of them later means deleting and re-adding the app.)*

A nutrition and training tracker for Bunny and Bear. It is a **separate PWA** from Bunnybear, the photo app: its own repo, its own database, its own domain, and its own home-screen icon. It belongs to the same family: same two people, same PINs, same Bunny and Bear marks and colors.

**Why separate:** the photo app is opened once a day and its design is about getting out of the way. This app is opened 15–20 times a day per person to log a snack in a couple of seconds, with a mic and numbers on every screen. Combining them would compromise one or the other.

**It starts from code that already exists.** Steps 1 to 4b of the first spec were built as a "Health mode" inside Bunnybear (commits `4a96d3b` to `338a3e4`): the food library, label reading, the MEXT reference table, the review queue, logging, quick log, recents, saved meals, shared meals, and a Claude connector. No real data was ever logged. That code moves into this repo (§12) rather than being rebuilt, and Health mode is then removed from Bunnybear.

**Read `ARCHITECTURE.md` first.** It describes the photo app, and this app copies its patterns (§11). Where this spec and that file differ, this spec wins for this app. **Read `mcpspec.md` too.** The MCP server is part of this app.

**Revised 2026-11-10.** After food logging went live, the workflow was redrawn around how we actually use it: a home screen with two buttons, a **fridge** that knows what is in the house, records for eating out, chat inside the app, and workouts done together. §1, §2, §3 (Navigation), §5.6, §5.7, §5.10, §5.11, §7.4, §8, §12 and §15 carry the revision. Where older text elsewhere in this file disagrees with them, they win.

---

## 1. Purpose

Two partners reaching their fitness goals together. Each of us tracks what we eat against a calorie and macro target, we know what food is in the house, and we log the lifting session we do together, by voice, chat or touch.

The app does two things, and the home screen has one button for each: **Add food** and **Start workout** (§8). Most days it is a food logger. The workout button is there once a day, until we've trained.

Eight ideas carry the design:

1. **Logging is frequent and has to be nearly free.** We eat many small snacks through the day, so expect 10–20 logs per person per day, not 2–3 meals. A log is one spoken sentence ("just had 1 shoyu senbei"). If the match is clear, it's added immediately with an undo, and there's no confirm screen.
2. **The catalogue is the source of truth for nutrition.** A model drafts food entries (from a label photo, a meat pack, or a name), a person confirms them once, and from then on the saved entry is the only source. The model never re-estimates a confirmed food. (Older sections call the catalogue "the library". They are the same thing.)
3. **The fridge is what's in the house.** After shopping we take stock; eating takes it away again. Buy 400g of chicken, eat 200g, and the fridge shows 200g (§5.10). It is one fridge for both of us.
4. **The model picks; the server counts.** Models turn messy input (photos, voice, chat) into structured drafts, and pick reference-table rows rather than recalling numbers. All totals and fridge arithmetic happen in SQL or server code.
5. **The app owns the facts; the assistant owns the conversation.** Claude, ChatGPT and the app's own chat are clients of the same server functions. No nutrition fact lives in a chat thread (`mcpspec.md` §2).
6. **A guess is allowed only when there is nothing better, and it looks like a guess.** A restaurant dish has no label and no weight, so it is logged as a calorie *range* and stays marked as an estimate everywhere it is counted (§5.11). Nothing with a label or a reference row is ever estimated.
7. **Most of our food is the same food.** Eating from the fridge is shared by default, split evenly, with each person's amount adjustable (§5.7).
8. **Together means visible.** Each of us can see the other's day: what they ate, where they stand against their targets, whether they've trained. Nothing more: no streaks, no scores, no nudges.

Targets are fixed for now (§13). Adjusting them from the weight trend is designed in §6 and deferred.

---

## 2. Scope

### In v1

- A standalone PWA with its own repo, database, and domain, self-hosted on a VPS in Tokyo (§3)
- A home screen with two buttons, Add food and Start workout, under an always-visible macro display (§8)
- Shared food catalogue: label reading, meat/fish pack reading, the MEXT reference table, by-name adds, manual entry
- **The fridge:** a shared inventory in grams, stocked after shopping and reduced by eating (§5.10)
- Food confirmation **in the PWA and in Claude or ChatGPT**, under one rule: a person sees the values and says yes
- Food logging four ways: pick from the fridge, say it, scan a label, or chat. Shared between both of us by default (§5.7)
- **Eating out:** a record of the place and the dish, with a photo estimate as a calorie range when there is nothing better (§5.11)
- **Chat inside the app**, with the same tools Claude and ChatGPT get through MCP (§10)
- Past days: look back, and correct them
- Calorie and macro targets with effective dates, seeded in §13 and static for now
- Training: lifting sessions done together. One of us starts, the other joins, and both log sets by voice, chat or touch against a plan that already exists (§7)
- Web push, for one thing only: telling your partner a workout has started
- MCP server for Claude and ChatGPT (read and write; see `mcpspec.md`)
- Daily backup job (§3)

### Deferred, designed in this file

Weigh-ins and the 7-day trend (§6.2), adaptive expenditure (§6.3), propose-and-approve target changes (§6.4), and the Trends screen. Until they are built, targets change only by editing the database.

### Out of scope for v1

Runs (they will come from Strava later, §7.5), Siri Shortcuts, Apple Health / step sync, micronutrients, barcode scanning, fasting-window tracking, push reminders to log, streaks or adherence scores, third users, building a workout plan inside the app, a native app wrapper (§3, kept as the fallback for mic prompts).

---

## 3. The app and its setup

### Deployment

| | |
|---|---|
| Repo | `git@github.com:thehonestfarmer/tummy.git`. Its old code is thrown away; the repo starts again from one fresh commit. |
| Hosting | A VPS in Tokyo (1 vCPU, 1 GB RAM, 32 GB NVMe), running Postgres and the app in Docker behind Caddy. **Not Vercel.** |
| Specs | This file (as `healthspec.md`) and `mcpspec.md` move out of the Bunnybear repo into this one. Keep a copy of `ARCHITECTURE.md` as the reference for ported patterns. |
| Stack | Same as the photo app (`ARCHITECTURE.md` §2): Next.js App Router, React, TypeScript, Bun, Tailwind v4, `postgres` driver with tagged-template SQL |
| Database | Postgres 18, on the same box, in the same `compose.yaml`. Backed up daily to Cloudflare R2. |
| Domain | `tummy.habitnpc.com`, an A record at Porkbun straight to the VPS. The apex and `www` stay on HabitNPC's landing page. |
| Photo storage | Only while a draft waits for review, then deleted (§5.3). Never kept. |
| Link to the photo app | None, either direction. They're separate icons on the home screen. |

**Why not Vercel.** Bunnybear on Vercel ran into the account's compute limits. This app's load is mostly waiting: on label reads (two models per photo while comparing), Whisper, and quick-log parsing, plus polling. Serverless bills that waiting; a VPS doesn't. Two alternatives were weighed and rejected:

- **Vercel proxying to the VPS.** It adds a hop and Vercel's own timeout and body-size limits (which matter for audio, photo batches, and MCP streaming) in exchange for HTTPS and a domain, which Caddy already gives.
- **Supabase.** Realtime could replace polling, but the LLM waits would need Edge Functions on Deno with a second copy of `lib/health`, breaking the one-service-layer rule (§11).

The VPS is in Tokyo because the two of us are in Japan, Korea and Taiwan: about 5–35 ms away, against 70 ms or more for Singapore and 150–200 ms for Toronto or Silicon Valley. The database is on the same box because a page or a quick log makes several round trips to it in a row, and each one would otherwise pay the network distance again (the quick-log target, §14). A managed database was weighed (Neon, whose nearest region is Singapore; Supabase, which has Tokyo) and rejected for this size: Postgres on the box costs no extra service, no latency, and about 150 MB of memory, as long as backups leave the box. PocketBase was weighed too, and rejected because the code is already written for Postgres (transactions, row and advisory locks, arrays, JSON, interval maths).

### Running on the VPS

| Concern | How |
|---|---|
| Build | `output: "standalone"` in `next.config.ts`. **Images are built off the box** (GitHub Actions on push to `main`), pushed to a registry, and pulled by the VPS. `next build` needs more memory than the box has. |
| Deploy | The Action SSHes in to pull and restart. About 30 lines. |
| HTTPS | Caddy with Let's Encrypt. It must stream responses unbuffered (MCP) and accept request bodies large enough for audio and photo batches. |
| Restarts | `restart: unless-stopped` |
| Background work | `after()` is supported under `next start`, and finishes on `SIGTERM` if given time. The container's stop grace period is 90 s, since label reads can be slow. At boot, the server re-reads any draft from the last day that never got a reading, in case a deploy cut one off. |
| Scheduled jobs | Host cron (`deploy/crontab`): the daily backup, a weekly restore check, and pruning of unreviewed photos older than 30 days (§5.3). Target proposals are computed when Today or Trends opens (§6.4), so they need no job. |
| Backup | Daily `pg_dump`, kept 7 days on the box and 90 days in Cloudflare R2 (`deploy/backup.sh`). A backup on the box alone would go down with it. Weekly, `deploy/restore-check.sh` restores the newest R2 copy into a throwaway Postgres and checks the data came with it. There are no blobs. Months of intake and lift history are hard to recreate. |
| Logs | Docker's `json-file` driver with `max-size` and `max-file` set. Unrotated logs are what fills a small disk. |
| Memory | 1–2 GB of swap as a safety margin |
| Secrets | An `.env` file on the box, never baked into the image |
| The box | SSH keys only, and a firewall open on 22, 80, and 443 |

Previews per branch go away. Local `dev` plus a tunnel (needed for the mic anyway) covers testing.

### Identity

- The same two users and **the same PINs** as the photo app, seeded into this app's database with `seed.mjs` from `BUNNY_PIN` and `BEAR_PIN`. The PIN auth, session cookie, and `withUser` pattern come from the photo app (`ARCHITECTURE.md` §5).
- The same Bunny and Bear marks and identity colors.
- An app installed on the home screen keeps its cookies apart from Safari, so each of us signs in once inside the installed app. The cookie lasts a year.

### Navigation

- **There is no tab bar.** The app is one screen, Home (§8), and everything else is reached from it.
- **The macro display** sits directly below the header on every screen (§8).
- **Add food** and **Start workout** are the two buttons on Home. The fridge, the chat and the scanner open from Add food. Workout mode takes over the screen while a session is open.
- **The header** carries the date (with a way back to past days), the fridge, and a small settings link: the Claude and ChatGPT connector, notifications, sign out.
- The catalogue and the review queue are not destinations. The catalogue is what search looks through; review is a step inside scanning (§5.3).
- Opening the app lands on Home, ready to log. There is no mode toggle and no `tb_mode` cookie.

### PWA

- Its own manifest: the final name, `start_url` on Today, `display: standalone`, the theme color, maskable icons, and an Apple touch icon.
- A service worker that caches only `/_next/static/*` plus an offline page, as in the photo app. It's on its own domain, so it can't collide with Bunnybear's.
- **Web push, for the workout invitation only** (§7.4). `web-push` with VAPID keys and one subscription row per device, as the photo app does it (`ARCHITECTURE.md` §10). iOS allows push only for an installed PWA. It is best-effort: the Join button on Home never depends on it.
- **Mic permission on iOS.** WebKit doesn't keep a home-screen app's mic grant across launches, and the recorder as built asks for the mic on every press, so iOS re-prompts often (hypernpc, whose recorder this one came from, shows the same thing). **Accepted for now.** In order, if it grates:
  1. Ask once per session: keep the stream, start a new `MediaRecorder` on it per press, stop the tracks only when the app is hidden. The cost is the mic indicator staying on while the app is open, and possibly lower-quality music while the mic is held, which matters on Train.
  2. Keyboard dictation into the typed quick-log field always works and never prompts.
  3. A thin native wrapper (Capacitor or a bare WKWebView pointed at the domain) grants the mic once, permanently. It needs an Apple Developer account and a re-signed install about once a year. The web app doesn't change.

### Moving in from Bunnybear

Start the repo by copying the Health code and these patterns from Bunnybear, then trimming anything photo-specific.

| Port | From |
|---|---|
| All of Health mode: `src/lib/health/*`, `src/app/(app)/health/*` (becoming the app root), `src/app/api/health/*`, `src/app/api/mcp/[token]`, `src/components/health/*`, `db/reference/mext-2023.csv`, `scripts/reference-csv.ts`, `scripts/seed-reference.ts`, `scripts/vision-compare.ts` | commits `4a96d3b`–`338a3e4` |
| PIN auth: `auth.ts`, the PIN pad page, `/api/auth/pin`, `/api/auth/logout`, `/api/me`, `SignOutButton` | `ARCHITECTURE.md` §5, §6 |
| `withUser` and the route-handler pattern (`lib/api.ts`, inline `parseX` helpers) | §5, §6 |
| `usePoll` | §4 |
| `/api/warm`, called from the PIN pad | §6 |
| The `(app)/layout.tsx` auth gate, header, and measured bottom chrome (`BottomChrome`, `TabBar` with this app's tabs) | §4, §11 |
| Design tokens in `globals.css`, Nunito, `Mark`, the identity colors, safe-area handling | §11 |
| `prepare()` resize (`lib/resize.ts`), for photos sent to vision. Drop the thumbnail and EXIF parts if unused. | §9 |
| Scripts: `migrate.mjs`, `seed.mjs`, `env.mjs`, `sql.mjs`, and the migration conventions | §3, §7 |
| PWA manifest (rewritten), new icons, the install hint, the service worker, the offline page | §10 |
| `AGENTS.md`, and the Bun, Next, and Tailwind versions | §2 |

**Changed on the way in:**

- **Migrations start again at `001_*.sql`.** There is no data, so `008`–`011` fold into a clean sequence after the users table.
- **The Siri Shortcut is removed:** `/api/health/shortcut/[token]`, the `shortcut` entry source, and its half of the settings screen. The per-person token stays, for the MCP connector.
- **Vercel Blob is removed.** Photos waiting for review go to a Docker volume (§5.3), and vision gets the image as bytes, not a URL.
- **`vercel.json` is removed**, along with `maxDuration` settings and anything that checks `process.env.VERCEL`.

**Don't port:** photos, days, reveal logic, archive, questions, signals, push, the letter, the daily cron, the mode toggle, `HeaderMarks`, or the dev tools. Port the dev strip's "switch to partner" only if testing both sides on one phone is still useful.

### Removing Health mode from Bunnybear

After this app is live: remove the mode toggle, `src/lib/mode.ts`, the `tb_mode` redirect, `/health`, `/api/health`, `/api/mcp`, `components/health`, `lib/health`, the MEXT CSV and its scripts, and the Health environment variables. **Leave migrations `008`–`011` and their tables in place.** Revert the header and `TabBar` to Photos only.

---

## 4. Time

This app uses the **phone's local calendar date**, not the photo app's Tokyo day.

- Every entry stores `logged_at` (timestamptz), `tz` (IANA name from the phone, via `Intl`), and `local_date` (the date in that zone at log time).
- `local_date` is set by the server from `logged_at` + `tz`, and is editable afterward (to move a late entry to the right day).
- "Today" is the local date of the request. The phone's zone travels in a cookie set by the client (`ZoneCookie`, as built). Until it's set, `Asia/Tokyo` stands in.
- Writes from Claude or ChatGPT use the acting user's last known zone from the PWA, unless the tool call passes one.
- In Japan, Korea, and Taiwan this matches the Tokyo date anyway. Moving locations is rare, so no rollover hour and no reconciliation logic in v1.

---

## 5. Food

Three things, kept apart:

| | What it is | Changes when |
|---|---|---|
| **Catalogue** (the "library" below) | Every food we've confirmed, with its nutrition per 100g | A food is scanned, named or typed in for the first time |
| **Fridge** (§5.10) | What is in the house now, in grams | We shop, eat, or throw something out |
| **Log** (§5.4) | What each of us ate, per day | Someone eats |

A convenience-store snack with a label goes in the catalogue and the log, and never the fridge. A restaurant dish goes in the log only (§5.11). All weights are grams.

### 5.1 Library

One **shared** library for both users. Each food stores:

| Field | Notes |
|---|---|
| name, name_ja (optional) | Display name; Japanese name if read from a label |
| aliases | Every way we've referred to it: English, Japanese, romaji, shorthand ("shoyu senbei", 醤油せんべい, "the rice crackers"). Grows automatically (§5.5). |
| kcal, protein_g, fat_g, carbs_g per 100g | Always normalized to per-100g |
| weight_basis | `raw` (default), `cooked`, or `as_packaged` |
| servings | Named servings with a unit word and grams: "1 piece = 9g", "1 pack = 180g", "1 egg = 55g". Counted snacks need a piece serving for "1 senbei" to resolve. |
| default_grams | Pre-fills the log sheet |
| source | `label_ocr`, `pack_read`, `reference_table`, `llm_estimate`, `manual` |
| client | Where it was submitted from: `pwa`, `claude`, or `chatgpt` |
| reference_food_id | The reference-table row the values came from or were checked against (§5.8), nullable |
| status | `draft` or `confirmed`. Only confirmed foods appear in search and logging. |
| reading | The label as printed (`mcpspec.md` §4.1): basis, basis grams, printed values, net weight, piece count, 名称, brand. The audit trail, since no photo is kept. |
| original | The reader's submission before a person changed anything (§5.3) |
| confirmed_by, confirmed_via, created_by, created_at, updated_at | `confirmed_via` is `pwa`, `claude`, or `chatgpt` |

**Rules**

- **Raw weight is the default.** We weigh raw. Every prompt asks for raw values unless the input says otherwise, and every confirmation shows the basis clearly.
- **Carbs are total carbohydrate.** If a Japanese label splits 糖質 and 食物繊維, store their sum. Targets are written in total carbs.
- **Plausibility check before confirm:** protein×4 + carbs×4 + fat×9 should be within 15% of stated kcal. If not, the confirmation flags it, in the app or in the chat. The person can still confirm.
- **Confirmed foods are never re-estimated.** To fix a food, edit it. Editing a food does not change past log entries (they carry snapshots, §5.4).

**Where a food's numbers come from, in order:**

1. A printed label. Most exact; it describes this exact product.
2. A reference-table row (§5.8), for anything without a panel.
3. A model's estimate, only when no row fits, flagged as `llm_estimate`.

### 5.2 Ways to add a food

All of these produce a **draft** that one of us confirms, either in the app (one tap, or edit then confirm) or in a chat (§5.9).

1. **Nutrition label photo.** One photo per pack by default: the back, where Japanese packaging carries both the 栄養成分表示 and the 一括表示 box. An optional second photo (usually the front) is allowed for items where the brand matters for telling similar products apart. The reader returns the label as printed (`mcpspec.md` §4.1):
   - nutrition: basis (per 100g / per serving / per package / per piece), kcal, protein, fat, carbs (or 糖質 + 食物繊維)
   - 名称 (generic name) and, if visible, the brand or product name
   - 内容量 (net weight) and the **piece count** if printed (e.g. 12枚, 8個)

   The server normalizes to per-100g. When both net weight and a piece count are present, it creates a piece serving automatically (e.g. 120g ÷ 12枚 → "1 piece = 10g"), so counted snacks resolve by voice with no follow-up question. Net weight also becomes a "1 pack" serving.
2. **Meat or fish pack photo.** Japanese supermarket packs for meat and fish usually carry no nutrition panel, just the product name, cut, and net weight. The reader gets the species and cut (e.g. 国産若鶏もも肉, まぐろ赤身 刺身用) and the net weight, then **picks the matching reference-table row** (§5.8), e.g. 若どり もも 皮つき 生. The values come from that row. Source = `pack_read`, with `reference_food_id` set. Only when no row fits does the model estimate per-100g raw values itself, and the draft is flagged as an estimate. Net weight becomes a named serving ("this pack = 212g").
3. **By name** (typed or voice): "chicken breast, skinless." The model picks a reference-table row (§5.8). Source = `reference_table`. If no row fits, it estimates per-100g raw values instead (source = `llm_estimate`), and the confirmation marks it as an estimate to check harder. This is also the path for unlabeled food (loose produce, eggs, unpackaged fish): say it with its weight ("apple, 180 grams"); the first time, it creates a draft to confirm, then logs.
4. **Manual:** type the numbers.
5. **From a chat.** Claude or ChatGPT reads a photo itself and submits the label as printed through `add_food` (`mcpspec.md`). Same structure, same derivation, same checks.

Before creating a draft, check the library for a likely existing match (by name, both languages) and offer it instead, so we don't end up with five chicken breasts.

### 5.3 Bulk seeding and the review queue

*(Revised: there is no Review tab. This flow is **Stock up**, opened from the fridge (§5.10): photograph the shopping, confirm each read, and say how many of each. The queue still exists for a batch, and for drafts started in a chat. Scanning one thing you are about to eat confirms in place, §5.6.)*

The library is seeded up front by photographing everything in the kitchen in one sitting.

- **Bulk upload:** select many photos at once. Each photo is one item by default; the uploader can group a second photo with the one before it (front + back). Each item becomes a draft, read in the background.
- **Review queue:** a screen listing drafts waiting for confirmation, worked through one at a time: the photo next to what the model read, and confirm or edit. Either of us can review, on either phone. The plausibility check (§5.1) and the reference cross-check (§5.8) flag suspicious drafts.
- **Photos are held only until review.** The resized image sits in a Docker volume on the VPS, served only to signed-in users. It is deleted when its draft is confirmed or discarded. Cron prunes any older than 30 days. Nothing else in the app stores a photo, and nothing keeps one.
- **Correction tracking:** when a draft is confirmed, store the reader's original output next to the confirmed values. Every field someone changed is a misread. This is how model accuracy is measured (§9).
- Single-item adds from the + Food sheet go through the same draft and confirm, without the queue.

### 5.4 Log entries

Each entry: user, food (nullable for one-off items), grams, **snapshot** of name and per-100g macros at log time, `logged_at`, `tz`, `local_date`, `source` (`touch`, `voice`, `mcp`), `client` (`pwa`, `claude`, `chatgpt`), `created_by`, and `shared_meal_id` (nullable).

- **Editable and deletable.** This breaks the photo app's write-once convention on purpose; logs need corrections (§11).
- Edits change grams or `local_date`; macros recompute from the snapshot's per-100g values.
- `source` gains `chat`, for the app's own chat (§10).
- An entry for a food that is in the fridge takes its grams out of the fridge (§5.10). Editing or deleting the entry puts back the difference, because what is left is derived, not stored.
- An entry for a dish eaten out has no food, a `place_dish_id`, and a low and a high value for each of kcal, protein, fat and carbs in place of a single snapshot (§5.11).

### 5.5 Quick log (voice first)

This is the main way food gets logged. Everything else in this section is a fallback.

**One server function, two entry points.** A single `quickLog(user, text)` function does the work. It's reached from:

1. **The mic button in the app**, present on every screen (in the macro bar). Hold to talk, release to send. Groq Whisper transcribes. The same field takes a typed sentence.
2. **Claude or ChatGPT via MCP**: the `log_food` tool calls the same function, so "just had 1 shoyu senbei" said to either one behaves exactly as it does in the app.

No Siri Shortcut.

**Resolution pipeline**

1. **Parse.** The model turns the sentence into items: food phrase, quantity, unit word ("1", "piece", "a handful", "200g"), and time phrase. It also works out who ate it: one of us, or both, and each person's amount when the sentence gives them ("I had two yogurts and Bunny had one", "125 of rice for me, 50 for her"). See §5.7.
2. **Match deterministically first.** Look up each food phrase against names and aliases in both languages, ranked by how recently and often this person has logged it. Snacks repeat, so most lookups end here.
3. **Model tie-break only when needed.** If several foods match, or none match exactly, send the phrase plus the top candidates (not the whole library) to the model to choose or say "no match".
4. **Resolve the amount.** A count ("1", "3") uses the food's piece serving. Grams are used as stated. A vague amount ("a handful", "some") uses the food's default grams.
5. **Resolve the time.** "Just had" means now. "An hour ago" or "at lunch" sets `logged_at` back.

**Commit or confirm**

- **Auto-commit** when every item matches one confirmed food with a known amount. The entry is added immediately and an undo toast shows for about 8 seconds: "Added 1 shoyu senbei · 41 kcal. Undo."
- **Confirm sheet** only when something is uncertain: no match, several close matches, a count with no piece serving, or a food still in draft. The sheet asks only about the uncertain item. "1 senbei" with no piece serving asks for the grams once, then saves them as a piece serving so it never asks again. Over MCP, the same cases come back as `needs_choice`.
- **No match at all** creates a draft through §5.2 (a reference row or estimate by name, or a prompt for a label photo) and logs against it once confirmed. It never falls back to a guessed number. The one exception is a dish eaten out, which is asked for as such and logged as a range (§5.11).

**The library learns.** Whenever a phrase is resolved through the model or the confirm sheet, that phrase is added to the food's aliases. The second time anyone says "the rice crackers," it's a deterministic match.

**Voice corrections.** "Actually that was 2," "undo that," and "remove the last one" act on the most recent entry from that person in the last 10 minutes.

### 5.6 Add food

**Add food** on Home opens one sheet with four ways in. All four end in the same log entries.

1. **From the fridge** (what the sheet opens on). What's in the house, most recently eaten first, each with what's left ("Greek yogurt · 3 left · 300g"). Tap one, set the amount, log. Saved meals sit above the list; search below it looks through the whole catalogue, for food that isn't in the fridge.
2. **Say it.** The quick-log mic (§5.5), as a large button in the sheet as well as beside the macro display.
3. **Scan it.** For something with a label that isn't in the catalogue yet, such as a convenience-store snack. The button opens the camera. One photo, of the nutrition table; see what was read, confirm, say how much, and log it or add it to the fridge. Amounts are counted in the food's own servings ("2 packs") where it has them, and in grams otherwise. One flow, no trip to a queue. The food is in the catalogue from then on. It does not go in the fridge unless you say there is more of it at home.
4. **Chat** (§10). Say what you ate in a sentence, or ask what you could eat: "what can I make from the fridge that fits what I have left today?"

A fifth path, **Eating out**, is for food with no label and no weight (§5.11).

Stocking the fridge after shopping is a different job from eating, and has its own entrance (§5.10).

### 5.7 Shared meals

Most of our food is the same food, so **shared is the default** when eating from the fridge.

- **By touch:** the amount step shows both of us, each with our own amount. Enter the total and it splits evenly: 400g of shrimp is 200g each. Either side can be changed on its own, in grams or in pieces, so "two yogurts for me, one for Bunny" and "125g of rice for me, 50g for Bear" are each one adjustment. A **Just me** switch drops the partner's side.
- **By voice or chat:** the words decide. "We", "both of us" or two named amounts make a shared log, split evenly unless amounts are given. "I had" or "just had" is the speaker's alone. **A sentence that names no one** ("400g of shrimp") is not guessed: it brings up a prompt with two buttons, **Split** and **Only me**, and is logged on the tap. Over MCP the same case comes back as a question for the assistant to ask.
- Logging creates one entry in each person's day, linked by `shared_meal_id`, in one transaction. The fridge loses the total.
- **Either of us can log a shared meal** into both days. The partner's half shows "added by Bear" (or Bunny).
- Each person can edit or delete their own half. Editing one half doesn't change the other; the fridge follows whichever half changed.
- Scanned one-off snacks and dishes eaten out default to **just me**. Each can be switched to both.
- Saved meals can be marked shared, so "usual dinner" logs to both in one tap.

### 5.8 Reference table

The official **日本食品標準成分表 (八訂)** from MEXT: about 2,500 generic foods, with separate raw, boiled, grilled and fried rows. It covers what a Japanese supermarket sells unbranded: produce, meat by animal, origin and cut (和牛 / 乳用肥育牛 / 輸入牛; 若どり もも 皮つき / 皮なし), fish and seafood by species, rice, noodles, tofu, eggs, dairy, and generic processed foods like ちくわ and 食パン. It does not cover branded products; those have labels. **Built** in Bunnybear; it moves over as is.

**Why.** A model's recall of common whole foods is usually close, but a wrong number looks as confident as a right one, and a bare number gives the reviewer nothing to check. A cited row ("スルメイカ 生") does: a slip like raw versus dried is visible at a glance. The model's job becomes picking the row, not producing the numbers (§1, idea 3).

**Storage.**
- A cleaned CSV is committed to the repo (`db/reference/mext-2023.csv`), with only the columns used: food number, food group, Japanese name, English name (where available), and kcal, protein, fat and total carbohydrate per 100g. Seeding is repeatable without depending on the download link.
- A migration creates `reference_foods`, separate from the `foods` library. `bun run seed:reference` loads it, run against each database like `migrate`, and again when MEXT publishes an update. The app only queries the table at runtime and never reads the file.
- The import handles the table's notation: `Tr` (trace) → 0; `-` (not measured) → null; parenthesised values (estimates) → the number. Carbs use the total 炭水化物 column, not 利用可能炭水化物, to match the targets (§5.1). Energy follows the 八訂 method, which is lower than older tables for some foods; that is expected.
- The README credits the source.

**Matching.** The server searches `reference_foods` by Japanese and English name (the model supplies a Japanese search term when the input is English, e.g. "squid" → イカ). The model then picks one row from the candidates or says none fits. It never sees the whole table. Every confirmation shows the chosen row's name next to the values.

**Cross-check for labels.** A label read by OCR, or submitted from a chat, is also matched to its nearest generic row (senbei → 米菓 しょうゆせんべい). If its per-100g values differ from that row by more than 50% on calories, the confirmation flags it: "This reads very differently from typical rice crackers. Check the numbers." This catches what the calories-versus-macros check (§5.1) can't: a dropped decimal, or a per-piece figure read as per-100g, where the macros scale along with the calories. It is a flag, not a block; specialty products legitimately differ.

**Form: raw, cooked, dried.** Form changes the numbers only through water, except for frying, which adds oil.
- **Home cooking:** log the food by raw weight with raw values, and log oil as its own food (a library entry with a "1 tbsp = 13g" serving). Cooking changes water, not macros, so this is exact for anything weighed raw. Stir-fry and shallow fry: log what was poured. Deep fry: log a rough absorbed amount.
- **Weighed after cooking** (rice from the cooker, leftovers): use the cooked row.
- **Dried** (するめ, dried fruit, katsuobushi): a separate food, never the same entry as fresh.
- **Fried by someone else** (takeout karaage, tempura): use the fried row, or an estimate, since the oil is unknown.
- When a food's rows differ by form and the input doesn't say which, assume raw (§5.1). "Cooked" isn't specific enough: boiled, grilled and fried differ, so ask which, once, and save the answer with the food.

### 5.9 Confirmation

**The rule, everywhere:** a food is saved as confirmed only after a person has seen its values and said yes. Both of us can confirm in either place.

- **PWA:** the confirm screen or the review queue, with the photo beside the reading.
- **Claude or ChatGPT:** the model shows what it read (name, basis, printed values, net weight, piece count, any reference row and any warnings), and asks. On yes, it calls `add_food` with `confirmed: true`. For a batch, it can show them all and take one yes for the set.
- Warnings travel with the values in both places: the plausibility check, the reference cross-check, and "this is an estimate".
- The server can't verify that a person saw the values in a chat. It relies on the tool description, and records `confirmed_via` on every food so a bad batch can be traced and fixed.
- A draft started in one place can be confirmed in the other. A label read in Claude but not yet confirmed appears in the PWA's review queue (without a photo, since the chat kept it).

### 5.10 The fridge

A digital copy of the food in the house: the fridge, the freezer and the cupboards together. One for both of us.

**What it holds.** For each catalogue food we have, the grams left, and the count where the food has a piece serving ("6 eggs · 330g"). A food with nothing left is not in the fridge. It stays in the catalogue.

**Stocking (after shopping).** A separate action from eating. The amount step under Add food ends in two buttons, **Log it** and **Add to fridge**, so anything picked or just photographed can go either way. *Stock up*, opened from the fridge, is the same thing for a whole shop at once.
- Photograph everything, as in §5.3. A food already in the catalogue is recognised and only needs its amount; a new one is read and confirmed first.
- The amount is the printed net weight times how many were bought. Meat and fish packs use the weight printed on the pack. Loose food is said or typed by weight or count ("6 eggs", "apples, 700 grams").
- By voice or chat: "we bought two packs of chicken thighs and a dozen eggs."

**Eating.** Logging a food that is in the fridge takes the logged grams out of it, whoever ate it and however it was logged (touch, voice, chat, Claude, ChatGPT). A shared meal takes the total. Eating a food that isn't in the fridge changes nothing there.

**What gets stocked.** Only food whose numbers are solid: it has a nutrition label, or it is found easily in the MEXT table (swordfish sashimi, salmon, eggs, chicken thigh). Condiments, oils and anything that would need an estimate are logged when eaten and never stocked.

**Weights are raw.** We weigh raw (§5.1), so the fridge counts raw grams, and cooking doesn't change them. Leftovers are not tracked as their own item; that can come later.

**Keeping it honest.** It will drift: a forgotten log, food thrown out, something eaten by a guest. Every item has three corrections: **Finished** (set to zero), **Threw it out** (set to zero, recorded as waste, not eaten), and **Set amount**. Eating more than the fridge thinks is there empties the item and logs the full amount; the log is never blocked by the fridge.

**Storage.**
- `fridge_changes`: food, grams, kind (`stocked`, `set`, `finished`, `discarded`), who, when, client. A ledger, never edited.
- What's left for a food is **derived on read** (§11): its changes and the log entries for that food are walked together in time order. `stocked` adds, `set` makes it exactly that amount, `finished` and `discarded` make it zero, and an entry takes its grams away, stopping at zero. So editing or deleting an entry corrects the fridge with no extra write, and eating more than was there never leaves a debt for the next shop to pay off.
- Stocking and logging the same food at the same moment from two phones goes through `sql.begin` with a row lock on the food.

**What it's for, beyond the list.** Chat can plan from it: "what could I eat for the rest of today?" gets an answer made only of food that is actually there, sized to the macros each of us has left (§10).

### 5.11 Eating out

For food with no label and no known weight: a restaurant, a café, someone else's cooking.

- A record of the **place** (name, and the area or branch if it matters) and the **dish**. Places and dishes are remembered, so the second bowl of the same ramen is one tap and the same numbers.
- **Where the numbers come from, in order:**
  1. Published nutrition, if the place prints it (chains often do). Entered once, exact, no range.
  2. A photo of the plate, read by the vision model, **as a last resort**. It returns a low and a high for kcal and for each macro, and what it took the dish to be.
  3. A description in words ("katsu curry, large"), estimated the same way, with a wider range.
- **An estimate is a range, and stays one.** The entry stores low and high. The log shows "650–900 kcal". The day's totals carry the range through: the macro display shows the midpoint with the spread beside it ("1,480 ±125"), and a day with no estimates shows a plain number. Macro composition is the weakest part of a photo estimate, so protein, fat and carbs from one are always shown as approximate.
- The estimate is made once and saved on the dish. It is never silently re-estimated; either of us can correct the range by hand, and the correction applies to that dish from then on.
- Never touches the fridge. Defaults to just me, switchable to both (§5.7).
- A convenience-store item **with a label** is not eating out. It is scanned into the catalogue (§5.6).

`places` (name, area), `place_dishes` (place, name, low and high per macro, source `published` | `photo` | `described` | `manual`, the model's description). Photos are read and discarded, like every other photo (§5.3).

---

## 6. Targets, weight, and expenditure

*(Targets are static for now: the seeded rows in §13, with no flow in the app that changes them. §6.2 to §6.4 are deferred, not dropped; the design stands for when they are built.)*

### 6.1 Targets

- `targets` rows: user, `effective_date`, kcal, protein_g, fat_g, carbs_g, `status` (`active`, `proposed`, `dismissed`), reason text.
- The active target for a day is the latest `active` row with `effective_date <= local_date`. Changing targets never rewrites past days.
- Same target every day; no per-day adjustment for training.
- **Seed values** are in §13.

### 6.2 Weigh-ins

- Manual entry, one per person per `local_date` (upsert). Weight in kg, optional waist in cm.
- **7-day rolling average** computed in SQL; trends are judged on the average, not single days.
- **Per-user display setting:** `raw` or `trend_only`. With `trend_only`, that person's daily numbers are hidden everywhere (including the partner's view and every MCP tool); only the trend line and weekly change show. Bunny's default is `trend_only`; Bear's is `raw`.

### 6.3 Adaptive expenditure

Computed per user, once at least 14 days of data exist:

- **Expenditure ≈ average daily intake − (trend weight change per day × 7,700 kcal/kg)** over the window, using the 7-day averages at each end.
- Require logging on at least 12 of the 14 days; otherwise skip and say why on Trends ("Need 2 more logged days to estimate").
- Store each estimate with its window, intake average, trend change, and days used.

### 6.4 Proposals (propose and approve)

- When Today or Trends opens and 14 days have passed since the last proposal (or on demand from Trends), compute a proposed target: estimated expenditure **plus** the person's energy balance. The balance is signed: positive for a surplus, negative for a deficit.
- Only propose if it differs from the active target by more than 100 kcal.
- **Macro redistribution:** protein stays at its g/kg setting, fat stays at or above its floor, carbs absorb the change.
- The proposal appears as a card on Today: "New target proposed: 1,850 kcal (was 1,925). Based on 14 days." **Approve** creates an active row effective today; **Dismiss** marks it dismissed.
- Per-user settings this needs: energy balance (signed kcal/day), protein g/kg, fat floor g. Seeded in §13.

---

## 7. Training

### 7.1 Plans

- Session plans are written in Claude and **pushed to the app through MCP** (`mcpspec.md`). The markdown stays the human-readable copy.
- A plan: user, date (optional), name ("Upper B"), notes, and ordered **blocks**. Each block has a label and a kind (`straight`, `superset`, `emom`, `intervals`, `finisher`, or `other`), and holds ordered exercises, each with its prescription text, target sets, rep range, target RIR, and start load.
- The original prescription text is stored on every exercise so nothing gets lost in structuring.
- Each of us has our own plans. Either can view the other's.

### 7.2 Exercises

- `exercises` table with canonical names and aliases ("chest-supported row", "CS row", "incline DB row"). The model maps whatever is said to a canonical exercise; unknown names create a new exercise after confirmation.

### 7.3 Set kinds

The model decides what kind a set is; the database stores one of a fixed set:

| Kind | Fields |
|---|---|
| `load_reps` | load_kg, `per_hand` flag, reps, rir |
| `time` | seconds (dead hang, plank, side plank) |
| `distance` | meters, optional load_kg (carries) |
| `rounds` | rounds completed, rating out of 10 (EMOMs, bag rounds, myo-rep clusters if needed) |

**Dumbbell and kettlebell loads are stored per hand**, with `per_hand = true`. Barbell and machine loads are total.

Every set also stores: exercise, session, set order, `source` (`touch`, `voice`, `mcp`), `client`, the **raw transcript** or input text, and `logged_at`. Sets are editable and deletable.

### 7.4 The session

We lift together, once a day at most, so a session belongs to both of us.

**Starting and joining.**
- **Start workout** is on Home for each of us until that person has trained today (a session with at least one set of theirs on today's date; derived, not stored). After that it is replaced by a quiet line, "Trained · Upper B". On a rest day the button simply sits there; nothing counts or nags.
- When one of us starts, the other gets a push ("Bear started Upper B. Join?") and, for 30 seconds, a prominent prompt in the app if it's open. That window is a prompt, not a cutoff: for as long as the session is open, the partner's button reads **Join Bear's workout**.
- Joining puts both of us in the same session. Each sees their own plan for the day and logs their own sets. Either can leave; the session closes when both have finished or left.
- A session nobody joins is a solo session. Nothing else changes.

**Logging sets.** Every set is matched to an exercise in a plan that exists beforehand (§7.1, §7.2), the same way a food phrase is matched to the catalogue.
- **Voice:** hold to talk, release to send. Groq Whisper transcribes; the model parses with the speaker's plan and the session so far as context, so "40 for 8, two left" lands on the active exercise. One utterance can log several sets.
- **Chat:** the same sentence typed, in the app or in Claude or ChatGPT, through the same server function.
- **Touch:** each exercise is pre-filled from the plan and the last logged result. One large button logs the pre-filled set. Steppers: ±2.5kg (the smallest DB jump), ±1 rep, RIR chips 0–4. Large targets, usable with chalk on the hands.
- A clear match is logged straight away with an undo. An exercise that isn't in today's plan, or a phrase that fits two, is asked about, never guessed.
- Either of us can log a set for the other ("Bunny did 20 for 10"); it is tagged with who entered it, like a shared meal.
- Show **time since the last logged set** (derived, no timer state), and what the partner last logged.
- At the end: session rating out of 10 and an optional note, per person.

**Storage.** `sessions` (date, started_by, started_at, ended_at) and `session_people` (session, user, plan, joined_at, finished_at, rating, note). Sets carry their user and session (§7.3). At most one open session at a time, enforced by a partial unique index.

### 7.5 Runs

Not in v1. Runs will come from Strava later, as their own feature. Nothing here logs a run by voice or screenshot.

---

## 8. Screens

Minimal on purpose. One home screen, two buttons, and the numbers always in view.

**Layout, settled from mockups on 2026-11-10 ("Home A"):** the top of the screen is for reading and the bottom edge is for acting. The macro display is one large "kcal left" number over a bar, with three smaller bars for protein, fat and carbs, filled in the person's own color. Docked at the bottom: a large **Add food**, a **Hold to talk** mic beside it, and a smaller **Start workout** above them. Corners are rounder and targets larger than the first build (about 10–12px radius, 48–64px tall buttons).

### Macro display (persistent)

Under the header on every screen: kcal, protein, fat and carbs for the current user. It should be the best-looking thing in the app, and readable at a glance without reading digits.

- Each of the four shows **how far along it is** as a shape (a bar or ring that fills), with the amount left as the number that matters. Calories lead; the three macros are smaller beside it.
- Going over a target is shown as a number and a filled shape, not a warning color. Quiet, as before.
- When the day includes an estimate (§5.11), the number carries its spread ("1,480 ±125") and the shape shows the uncertain part more faintly.
- The **quick-log mic** sits at its end (§5.5), so it is on every screen. The display updates in place when an entry is logged.
- On a past day it shows that day's totals against the target that applied then.

### Home

1. **Add food**, the main button (§5.6).
2. **Start workout**, or **Join Bear's workout**, until you've trained today (§7.4). Then a quiet "Trained" line in its place.
3. Today's entries, newest first. Runs of snacks in one hour collapse into one row ("3 snacks · 140 kcal") that expands on tap. Each entry is editable. A shared entry says so; an estimate shows its range.
4. **Your partner's day**, in their color: their macro display, smaller, and whether they've trained. Tapping it opens their day, read-only.

**Past days.** The date in the header steps back and forward, and opens a calendar. A past day shows the same list and can be corrected the same way: edit, delete, move an entry, or add something forgotten. Corrections to past days move the fridge like any other log.

### Add food

The sheet in §5.6: the fridge list, the mic, scan, chat, and eating out.

### Fridge

Reached from the header and from Add food. Everything in the house with what's left, searchable, grouped loosely (meat and fish, dairy and eggs, produce, dry goods, snacks). **Stock up** at the top (§5.10). Tapping an item: eat some, set the amount, finished, threw it out, or open the food's catalogue entry to fix its numbers.

### Chat

Opened from Add food, and in workout mode. A plain conversation with the app (§10): log food or sets, ask what's left today, ask what to cook from the fridge. What it logs appears on Home with the same undo as anything else.

### Workout mode

Takes over the screen while a session is open (§7.4): today's plan in block order, the active exercise large, the mic and chat for logging sets, and the partner's progress alongside. The macro display stays at the top; leaving workout mode returns to Home with the session still open.

### Settings

Small, behind the header: each person's connector links for Claude and ChatGPT with setup steps, notifications on this device, sign out.

### Not screens any more

The catalogue has no tab; it is searched from Add food and edited from a fridge item or a log entry. The review queue has no tab; it appears inside Stock up, and as a "3 waiting to confirm" line on the fridge when drafts exist (including ones started in a chat).

---

## 9. LLM layer

| Job | Provider | Why |
|---|---|---|
| Label, pack, and screenshot reading (PWA path) | **Claude or Gemini Flash, picked by comparison** | Accuracy matters most here |
| Picking reference rows, tie-breaks | Claude, as built (`HEALTH_TEXT_MODEL`) | Few calls, and a wrong pick is a wrong number |
| Transcription | Groq Whisper | Speed |
| Parsing food lines and sets | Groq | Speed |
| Estimating a dish eaten out from a photo or description (§5.11) | The vision model picked above | One call per new dish; returns a range, never a single number |
| Chat inside the app (§10) | Claude, with the MCP tool set | It has to use tools well; cost is per message, so it is the paid path |

- **Pick the vision model from real seeding data.** The first seeding batch is read by one Claude model and the current Gemini Flash side by side. `vision.ts` already reads every draft with each model in `HEALTH_VISION_COMPARE` and stores each reading in `food_readings`; it gains a switch on the model name so `gemini-*` goes to Gemini. `bun run vision:compare` scores each against what the reviewer confirmed (kcal, macros, net weight, piece count, name) and writes `docs/vision-comparison.md`, kept in the repo. Keep the winner; empty `HEALTH_VISION_COMPARE` to stop paying for the second read. Check current model IDs at build time.
- **Gemini is called the way `habit-battle/hank-api` does it** (`services/gemini-function-calling.ts`): a plain `fetch` to `v1beta/models/<model>:generateContent?key=…` with `functionDeclarations`, reading `functionCall` from the response. For labels, the image goes in as base64 `inline_data`, and one forced function call (`submit_label`) whose parameters are the label-as-printed schema. That gives typed output, like the Claude path's schema.
- Every model call returns **strict JSON against a schema**, validated server-side. A failed parse throws an `Error` with user-facing copy ("Couldn't read that label. Try a closer photo."), matching the `withUser` error pattern.
- **The model never computes totals** and never returns per-serving values without the basis. The server normalizes and counts.
- **The model picks reference rows rather than recalling numbers** (§5.8). Its own per-100g estimate is the last resort, and is always flagged.
- Store raw inputs (transcript text, the reading as printed) on the resulting rows. Photos are not stored beyond review (§5.3).
- **In Claude and ChatGPT, the chat's own model reads the photo** and submits the label as printed (`mcpspec.md` §4.1). The server never sees those photos. Both paths produce the same structure.

---

## 10. MCP server

**See `mcpspec.md`.** It covers the MCP server in full: the surfaces (Claude, ChatGPT, PWA), identity, the label-as-printed data contract, all tools, per-user guidance, confirmation, and build order. It supersedes anything about the MCP in this file.

Writes record the client that made them (`pwa`, `claude`, `chatgpt`).

### Chat inside the app

The same conversation can happen in two places: in Claude or ChatGPT through the connector, or in Tummy's own chat. Both go through the same tools and change the same state, so a thing said in either shows up in both.

- The in-app chat is a model run by our server (Claude, through the API) and given **the same tool definitions the MCP server exposes**, built from one list in `lib/health/mcp.ts`. It calls the `lib/health` functions directly, not over HTTP. There is one set of tools and one set of rules (`get_guidelines`), not two.
- It is identified by the session cookie, as the rest of the PWA is. Its writes are tagged `client: pwa`, `source: chat`.
- **It costs API credits per message; the same sentence in Claude or ChatGPT is free.** So the in-app chat is the convenient path, and the connector stays the main one for long conversations such as planning a week or reviewing a plan.
- It holds no facts (§1, idea 5). Each turn reads fresh from the server. The transcript is kept per person for the current day only, so a follow-up ("make that 2") has something to refer to.
- What it can do in v1: log food and sets, undo, answer "what have I got left today", and plan from the fridge against each person's remaining macros. `mcpspec.md` lists the tools this adds.

---

## 11. Conventions

**Copied from the photo app** (`ARCHITECTURE.md`): server-component pages + `*Client` + `usePoll`; mutations return the full refreshed view model; no Server Actions; `withUser`; tagged-template SQL, no ORM; additive, deploy-safe migrations starting at `001_*.sql`, each opening with a why-comment; derive state rather than store it where possible; DB constraints over app-level invariants; `sql.begin` with `select … for update` for writes that touch both users; comments that explain why; the dark graphite theme, Nunito, the identity colors, and the copy voice.

**Different from the photo app, because this is a different kind of app:**

- **Data is editable.** Food entries, sets, weigh-ins, and foods can be edited and deleted. Entries carry snapshots so editing a food doesn't change history.
- **Time is the phone's local date**, not a fixed anchor timezone.
- **Numbers and charts are core.** Keep the no-dependency habit if practical (hand-rolled SVG charts), but that's the implementing agent's call.
- **External APIs:** Claude and Gemini for reading, picking and the in-app chat, Groq for transcription and parsing. No Blob storage. Web push for one thing, the workout invitation (§3).
- **Estimates exist, as ranges.** A dish eaten out is the only number in the app that a model produced without a label or a reference row behind it, and it is stored and shown as a range (§5.11).
- **Self-hosted**, not serverless (§3).
- **Some derived numbers are stored.** Expenditure estimates and target proposals are rows, because each one is a decision made at a point in time. Daily totals and trends are still derived on read.
- **Domain logic lives in `lib/health/` service functions** that both the route handlers and the MCP tools call. The MCP is a first-class client, not an add-on.

---

## 12. Build order

**Built and live** at tummy.habitnpc.com: the catalogue and label reading (Claude and Gemini), the reference table, the review queue, log entries, the macro bar and targets, quick log by voice and typing, recents, saved meals, shared meals, and the MCP server with its food tools, context, guidance, choices and edits. The repo, the Tokyo VPS, the deploy pipeline and backups are done.

**Still open from the first plan:** the kitchen seeding and the vision-model comparison (now done through Stock up, step 2), and removing Health mode from Bunnybear.

**From here, in order:**

1. **Home, the macro display, past days.** Remove the tab bar; Home with Add food and the entry list; the redesigned macro display; date navigation and correcting past days; the partner's day; settings behind the header. Interface only, no new tables. Start workout appears with step 6.
2. **The fridge.** *(Core built: the ledger, Add to fridge, eating draws it down, the fridge list under Add food and on the fridge screen with its corrections. Still to do: Stock up for a whole shop, and the MCP tools.)* `fridge_changes`, what's-left derivation, Stock up (reusing bulk add and review), eating reduces stock, the fridge screen and its corrections, the fridge as the Add food list. Fridge tools in the MCP.
3. **Scan and eat in one flow; shared by default.** *(Scan built: camera straight from Add food, confirm in place, amounts in servings.)* Single-item scan that confirms in place and logs. The two-person amount step with per-person grams and pieces; who-ate-it parsing for voice.
4. **Eating out.** Places and dishes, published values, the photo and description estimates as ranges, ranges carried through totals and the macro display.
5. **Chat inside the app.** One tool list shared with the MCP server; the chat sheet; planning from the fridge.
6. **Training.** Web push; plans and exercises pushed from Claude; the shared session with start and join; set logging by touch, then voice and chat; workout mode.
7. **Later:** weigh-ins and the trend, adaptive expenditure and proposals (§6), Trends, runs from Strava.

**Ship points:** each of steps 1 to 5 is usable on its own. Step 1 changes how the app feels without changing what it stores.

---

## 13. Seed values

Set on 2026-10-28. Both of us lift 4× a week and run 3–4× a week. Bear (71 kg, 5'8", 38) wants to gain slowly; Bunny (63 kg, 5'4", 28) wants to lose fat while keeping or building muscle, and is new to lifting.

Starting maintenance is taken from the Oct 7 estimates: about **2,575 kcal** for Bear and **2,125 kcal** for Bunny. Cross-checked against Mifflin-St Jeor with an activity factor of 1.55–1.725: Bunny 2,085–2,320 kcal, Bear 2,490–2,770 kcal. Both Oct 7 figures sit inside those ranges. These are guesses. The adaptive expenditure estimate (§6.3) replaces them with measured numbers after 14 logged days, and every change after that goes through a proposal (§6.4).

| Setting | Bear | Bunny | Why |
|---|---|---|---|
| kcal | 2,825 | 1,700 | Maintenance +250 / −425 |
| Protein g | 130 | 125 | 1.8 g/kg gaining; 2.0 g/kg in a deficit, to keep muscle |
| Fat g | 75 | 50 | About 25% of calories; both above the 45 g floor |
| Carbs g | 405 | 185 | The remainder; total carbohydrate. Fuels the running. |
| Energy balance kcal/day | +250 | −425 | Bear: slow lean gain. Bunny: about 0.4 kg a week, moderate enough to keep training quality and suit a new lifter |
| Protein g/kg (for proposals) | 1.8 | 2.0 | |
| Fat floor g | 45 | 45 | |
| Weight display | `raw` | `trend_only` | |

---

## 14. Open questions

1. **How wide a photo estimate's range is in practice**, and whether a day with two estimates is still useful against a target. Measure on real meals.
2. **In-app chat cost.** Which Claude model, and whether the day-long transcript needs trimming. Measure a normal day's messages.
3. **ChatGPT.** Check again, before Bunny relies on it, whether ChatGPT accepts a secret in the connector URL and whether write tools run in its mobile apps (`mcpspec.md` §12). Claude remains the dependable path.
4. **Quick-log latency.** The target is under about 3 seconds from release to "Added" on a deterministic match. Measure Whisper + parse + match on real devices over mobile data.
5. **Mic prompts on iOS.** Accepted for now; the options are in §3.

---

## 15. Settled parameters

| Parameter | Value |
|---|---|
| Placement | Separate PWA: own repo, own database, own domain; no links to or from the photo app |
| Starting point | The Health mode built in Bunnybear, moved in; not rebuilt |
| Repo | `thehonestfarmer/tummy`, old code discarded |
| Hosting | Tokyo VPS, Docker + Caddy, images built and smoke-tested off the box. Not Vercel, not proxied through Vercel. |
| Database | Postgres 18 on the box; daily backups to Cloudflare R2, restore-checked weekly. Not Neon, Supabase, or PocketBase. |
| Bunnybear afterward | Mode toggle and Health routes removed; tables left in place |
| Identity | Same PINs, marks, and colors as the photo app |
| Name, icon, address | Tummy; a dumbbell resting on a rice bowl; `tummy.habitnpc.com` |
| Health day | Phone's local calendar date, sent in a cookie |
| Library | Shared between both users |
| Library seeding | Bulk photo upload + review queue in the PWA, and from chat |
| Photos per pack | One, of the nutrition table. No front photo. |
| Photos | Held on the server only until review, then deleted. Never kept. The reading as printed is the audit trail. |
| Piece servings | Created automatically from net weight ÷ piece count when both are printed |
| Unlabeled food | Voice with weight, via a reference-table row; model estimate only as a flagged fallback |
| Reference table | 日本食品標準成分表 (八訂), committed as CSV, imported into `reference_foods` |
| Number sources, in order | Printed label → reference row → flagged estimate |
| Cooking | Log raw weight with raw values; oil logged separately |
| Label reading | PWA: Claude or Gemini Flash, picked by comparison. Chats: the chat's own model. Same submitted structure. |
| OCR accuracy | Measured from corrections during review; Claude and Gemini compared on the first batch |
| Confirmation | Same rule everywhere: a person sees the values and says yes. Possible in both the PWA and Claude or ChatGPT. |
| App vs assistant | The app owns every fact and number; assistants hold no data |
| Weight basis | Raw by default |
| Carbs | Total carbohydrate |
| Shared meals | The default when eating from the fridge. Even split, each person's amount adjustable in grams or pieces. One-off snacks and eating out default to just me. |
| Who logs shared meals | Either person, into both days |
| Partner visibility | Each sees the other's day: food, targets, whether they've trained. Nothing beyond seeing: no streaks, scores or nudges. |
| Targets | Static for now (§13). Propose-and-approve from the weight trend is designed (§6) and deferred. |
| Calories and training | Training never changes the day's target |
| Logging frequency | 10–20 logs per person per day; snacks included |
| Quick log | One utterance; auto-commit with undo on a clear match, confirm only the uncertain item |
| Quick-log entry points | In-app mic (or typed), and Claude or ChatGPT via MCP — one server function. No Siri Shortcut. |
| Voice | Push-to-talk, Groq Whisper. iOS mic re-prompts accepted for now. |
| Transcription and parsing | Groq |
| DB and KB loads | Stored per hand, flagged |
| Runs | Not in v1. From Strava later. |
| Steps / Apple Health | Out of v1 |
| Weigh-ins | Manual; deferred with the rest of §6 |
| Security | Lax; two private users |
| Home | One screen, two buttons: Add food, and Start workout until you've trained today. No tab bar. |
| Macro display | Always visible; progress as a shape, the amount left as the number |
| Units | Grams everywhere |
| Catalogue vs fridge vs log | Three separate things: known foods, what's in the house, what was eaten |
| Fridge | One, shared. Stocked after shopping, reduced by eating. What's left is derived from a ledger and the log. Never blocks a log. |
| Scanning vs eating | Different actions. Stock up fills the fridge; scan-and-eat logs one thing and adds it to the catalogue. |
| Food not in the fridge | With a label (convenience store): scan into the catalogue and log. Without one (restaurant): a place and dish record. |
| Eating out | Counts toward totals, as a low–high range that stays visible. A photo estimate is the last resort. Saved per dish and reused. |
| Ways to add food | From the fridge, by voice, by scanning, by chat |
| Chat | In the app and in Claude or ChatGPT, through one tool list and the same state. In-app costs API credits; the connector is free. |
| Workouts | Lifting only. Done together: one starts, the other is prompted (push, and 30 seconds in-app) and can join while the session is open. |
| Set logging | Voice, chat or touch, matched to an exercise in a plan that exists beforehand |
| Push | Web push, for the workout invitation only |
| Past days | Viewable and correctable |
| Voice log that names no one | Asks: Split, or Only me. Never guessed. |
| What the fridge stocks | Only food with a label or an easy MEXT row. No condiments, no estimates. |
| Leftovers | Not tracked as items; later |
| In-app chat transcript | Kept for the current day only |
