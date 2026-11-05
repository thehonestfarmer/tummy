# Tummy — build spec

*(Tummy is the working name, and the name of the repo. The final name and icon must be settled before either of us installs the app: iOS fixes both at "Add to Home Screen", and changing them later means deleting and re-adding the app.)*

A nutrition and training tracker for Bunny and Bear. It is a **separate PWA** from Bunnybear, the photo app: its own repo, its own database, its own domain, and its own home-screen icon. It belongs to the same family: same two people, same PINs, same Bunny and Bear marks and colors.

**Why separate:** the photo app is opened once a day and its design is about getting out of the way. This app is opened 15–20 times a day per person to log a snack in a couple of seconds, with a mic and numbers on every screen. Combining them would compromise one or the other.

**It starts from code that already exists.** Steps 1 to 4b of the first spec were built as a "Health mode" inside Bunnybear (commits `4a96d3b` to `338a3e4`): the food library, label reading, the MEXT reference table, the review queue, logging, quick log, recents, saved meals, shared meals, and a Claude connector. No real data was ever logged. That code moves into this repo (§12) rather than being rebuilt, and Health mode is then removed from Bunnybear.

**Read `ARCHITECTURE.md` first.** It describes the photo app, and this app copies its patterns (§11). Where this spec and that file differ, this spec wins for this app. **Read `mcpspec.md` too.** The MCP server is part of this app.

---

## 1. Purpose

Track what each of us eats against a calorie and macro target, log training sets at the rack by voice or touch, and let the targets adjust from real data instead of formulas.

Five ideas carry the design:

1. **Logging is frequent and has to be nearly free.** We eat many small snacks through the day, so expect 10–20 logs per person per day, not 2–3 meals. A log is one spoken sentence ("just had 1 shoyu senbei"). If the match is clear, it's added immediately with an undo, and there's no confirm screen.
2. **The library is the source of truth for food.** A model drafts food entries (from a label photo, a meat pack, or a name), a person confirms them once, and from then on the saved entry is the only source. The model never re-estimates a confirmed food.
3. **The model picks; the server counts.** Models turn messy input (photos, voice, screenshots) into structured drafts, and pick reference-table rows rather than recalling numbers. All totals, trends, and expenditure math happen in SQL or server code.
4. **The app owns the facts; the assistant owns the conversation.** Claude and ChatGPT are clients of this app, the same as the phone. No nutrition fact lives in a chat thread (`mcpspec.md` §2).
5. **Calorie targets come from the weight trend, not from workouts.** Logged training never raises the day's calorie target. Every two weeks the app back-calculates real expenditure from intake and the weight trend, and proposes a new target for approval.

---

## 2. Scope

### In v1

- A standalone PWA with its own repo, database, and domain, self-hosted on a VPS in Singapore (§3)
- Shared food library: label reading, meat/fish pack reading, the MEXT reference table, by-name adds, manual entry
- Food confirmation **in the PWA and in Claude or ChatGPT**, under one rule: a person sees the values and says yes
- Food logging: search, recents, saved meals, voice, and **shared meals** split between both of us
- Persistent macro bar on every screen
- Calorie and macro targets with effective dates, seeded in §13
- Manual weigh-ins with a 7-day trend
- Adaptive expenditure and **propose-and-approve** target changes
- Training: session plans pushed from Claude via MCP; set logging by touch and push-to-talk voice
- Run logging by voice or by screenshot upload
- Trends: weight, intake vs target, expenditure, per-exercise progression
- MCP server for Claude and ChatGPT (read and write; see `mcpspec.md`)
- Weekly backup job (§3)

### Out of scope for v1

Siri Shortcuts, Strava, Apple Health / step sync, meal-photo calorie estimation for plated food, micronutrients, barcode scanning, fasting-window tracking, push reminders to log, streaks or adherence scores, third users, a native app wrapper (§3, kept as the fallback for mic prompts).

---

## 3. The app and its setup

### Deployment

| | |
|---|---|
| Repo | `git@github.com:thehonestfarmer/tummy.git`. Its old code is thrown away; the repo starts again from one fresh commit. |
| Hosting | A VPS in Singapore (1 vCPU, 1 GB RAM, 32 GB NVMe), running the app as one Docker container behind Caddy. **Not Vercel.** |
| Specs | This file (as `healthspec.md`) and `mcpspec.md` move out of the Bunnybear repo into this one. Keep a copy of `ARCHITECTURE.md` as the reference for ported patterns. |
| Stack | Same as the photo app (`ARCHITECTURE.md` §2): Next.js App Router, React, TypeScript, Bun, Tailwind v4, `postgres` driver with tagged-template SQL |
| Database | A **new Neon project** in `ap-southeast-1` (Singapore) |
| Domain | Its own, pointed straight at the VPS. To be decided. |
| Photo storage | Only while a draft waits for review, then deleted (§5.3). Never kept. |
| Link to the photo app | None, either direction. They're separate icons on the home screen. |

**Why not Vercel.** Bunnybear on Vercel ran into the account's compute limits. This app's load is mostly waiting: on label reads (two models per photo while comparing), Whisper, and quick-log parsing, plus polling. Serverless bills that waiting; a VPS doesn't. Two alternatives were weighed and rejected:

- **Vercel proxying to the VPS.** It adds a hop and Vercel's own timeout and body-size limits (which matter for audio, photo batches, and MCP streaming) in exchange for HTTPS and a domain, which Caddy already gives.
- **Supabase.** Realtime could replace polling, but the LLM waits would need Edge Functions on Deno with a second copy of `lib/health`, breaking the one-service-layer rule (§11).

The VPS is in Singapore because a server in Toronto or Silicon Valley adds roughly 150–200 ms to every database round trip, against the quick-log target (§14).

### Running on the VPS

| Concern | How |
|---|---|
| Build | `output: "standalone"` in `next.config.ts`. **Images are built off the box** (GitHub Actions on push to `main`), pushed to a registry, and pulled by the VPS. `next build` needs more memory than the box has. |
| Deploy | The Action SSHes in to pull and restart. About 30 lines. |
| HTTPS | Caddy with Let's Encrypt. It must stream responses unbuffered (MCP) and accept request bodies large enough for audio and photo batches. |
| Restarts | `restart: unless-stopped` |
| Background work | `after()` is supported under `next start`, and finishes on `SIGTERM` if given time. Set the container's stop grace period to about 90 s, since label reads can be slow. A sweep re-queues any draft stuck in `reading` for more than a few minutes, in case a deploy cut one off. |
| Scheduled jobs | Host cron: a Neon keep-alive every few minutes (§14), the weekly backup, and pruning of unreviewed photos older than 30 days (§5.3). Target proposals are computed when Today or Trends opens (§6.4), so they need no job. |
| Backup | Weekly `pg_dump` of the database to the VPS, keeping the last 8. There are no blobs. Months of intake and lift history are hard to recreate. |
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

- **Tab bar:** Today, Train, Trends.
- **The macro bar** sits directly below the header on every screen (§8), with the quick-log mic at its end.
- Opening the app lands on Today, ready to log. There is no mode toggle and no `tb_mode` cookie.

### PWA

- Its own manifest: the final name, `start_url` on Today, `display: standalone`, the theme color, maskable icons, and an Apple touch icon.
- A service worker that caches only `/_next/static/*` plus an offline page, as in the photo app. It's on its own domain, so it can't collide with Bunnybear's.
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

### 5.5 Quick log (voice first)

This is the main way food gets logged. Everything else in this section is a fallback.

**One server function, two entry points.** A single `quickLog(user, text)` function does the work. It's reached from:

1. **The mic button in the app**, present on every screen (in the macro bar). Hold to talk, release to send. Groq Whisper transcribes. The same field takes a typed sentence.
2. **Claude or ChatGPT via MCP**: the `log_food` tool calls the same function, so "just had 1 shoyu senbei" said to either one behaves exactly as it does in the app.

No Siri Shortcut.

**Resolution pipeline**

1. **Parse.** The model turns the sentence into items: food phrase, quantity, unit word ("1", "piece", "a handful", "200g"), and time phrase. It also flags "we" or "both of us" as a shared log.
2. **Match deterministically first.** Look up each food phrase against names and aliases in both languages, ranked by how recently and often this person has logged it. Snacks repeat, so most lookups end here.
3. **Model tie-break only when needed.** If several foods match, or none match exactly, send the phrase plus the top candidates (not the whole library) to the model to choose or say "no match".
4. **Resolve the amount.** A count ("1", "3") uses the food's piece serving. Grams are used as stated. A vague amount ("a handful", "some") uses the food's default grams.
5. **Resolve the time.** "Just had" means now. "An hour ago" or "at lunch" sets `logged_at` back.

**Commit or confirm**

- **Auto-commit** when every item matches one confirmed food with a known amount. The entry is added immediately and an undo toast shows for about 8 seconds: "Added 1 shoyu senbei · 41 kcal. Undo."
- **Confirm sheet** only when something is uncertain: no match, several close matches, a count with no piece serving, or a food still in draft. The sheet asks only about the uncertain item. "1 senbei" with no piece serving asks for the grams once, then saves them as a piece serving so it never asks again. Over MCP, the same cases come back as `needs_choice`.
- **No match at all** creates a draft through §5.2 (a reference row or estimate by name, or a prompt for a label photo) and logs against it once confirmed. It never falls back to a guessed number.

**The library learns.** Whenever a phrase is resolved through the model or the confirm sheet, that phrase is added to the food's aliases. The second time anyone says "the rice crackers," it's a deterministic match.

**Voice corrections.** "Actually that was 2," "undo that," and "remove the last one" act on the most recent entry from that person in the last 10 minutes.

### 5.6 Other ways to log

From the **+ Food** sheet, for when voice isn't convenient:

1. **Recents** for this person (last 14 days), one tap to log with last grams.
2. **Saved meals**: a named list of foods with grams ("usual lunch"). One tap logs all items.
3. **Search** the confirmed library.
4. **Add new food** (§5.2).

### 5.7 Shared meals

Most of our food is the same food.

- By voice, "we" or "both of us" makes a shared log ("we split a bag of senbei"), defaulting to 50/50 and auto-committing under the same rules as §5.5.
- A **"Both of us"** toggle on the log sheet. When on, enter the total grams once; the sheet shows both people with their own grams, **defaulting to 50/50**, adjustable per side.
- Logging creates two entries linked by `shared_meal_id`, one in each person's day, in one transaction.
- **Either of us can log a shared meal** into both days. The partner's half shows "added by Bear" (or Bunny).
- Each person can edit or delete their own half. Editing one half doesn't change the other.
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

---

## 6. Targets, weight, and expenditure

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

### 7.4 Logger

- **Train** opens today's planned session for the current user, or a blank session if none exists.
- Blocks appear in plan order. Each exercise is **pre-filled** from the plan and the last logged result for that exercise.
- **Touch:** one large button logs the pre-filled set. Steppers: ±2.5kg (the smallest DB jump), ±1 rep, RIR chips 0–4. Large targets, usable with chalk on the hands.
- **Voice:** hold to talk, release to send. Groq Whisper transcribes; the model parses with the current session as context (so "40 for 8, two left" maps to the active exercise). The parsed set(s) appear for a one-tap confirm. One utterance can log several sets.
- Show **time since the last logged set** (derived, no timer state).
- At the end: session rating out of 10 and an optional note.

### 7.5 Runs

No Strava. A run is logged as an activity: kind `run`, duration, distance (optional), average HR (optional), notes, source, client. Screenshots are read and discarded, not stored.

- **Voice:** "easy run, 25 minutes, about 4k."
- **Screenshot:** upload a screenshot from any running app; vision extracts duration, distance, pace, and average HR into a draft. In a chat, the assistant reads it and calls `log_run` with the fields.
- Runs are context only. They never change the calorie target.

---

## 8. Screens

### Macro bar (persistent)

Under the header on every screen: kcal, protein, fat, carbs for the current user, each as consumed vs target with the number remaining. Plain and quiet. Going over a target is shown as a number, not a warning color.

The **quick-log mic** sits at the end of the bar (§5.5). It updates the bar in place when an entry auto-commits.

### Today

1. Proposal card, when one exists (§6.4)
2. Today's food entries, newest first. With 10–20 small entries a day, runs of snacks collapse into one row per hour ("3 snacks · 140 kcal"), which expands on tap. Each entry is editable.
3. **+ Food** button (§5.6). The quick-log mic lives in the macro bar, so it's on every screen.
4. Weigh-in row: today's weight if logged, or a field to log it
5. Partner's compact row: their macro bar for today, smaller, in their color

### Train

Today's session (§7.4). A link to the partner's session for the day.

### Trends

- Weight: 7-day trend line (respects `trend_only`), weekly change
- Intake vs target, daily bars over the last 4 weeks
- Expenditure estimates over time
- Per-exercise progression: pick an exercise, see best set per session (load × reps) and volume
- Runs list

### Food library and review

Reached from the + Food sheet. Search, edit, the review queue (§5.3), and drafts started in a chat.

### Connect

Each person's own connector URL for Claude and ChatGPT, with setup steps (as built, minus the Siri half).

---

## 9. LLM layer

| Job | Provider | Why |
|---|---|---|
| Label, pack, and screenshot reading (PWA path) | **Claude or Gemini Flash, picked by comparison** | Accuracy matters most here |
| Picking reference rows, tie-breaks | Claude, as built (`HEALTH_TEXT_MODEL`) | Few calls, and a wrong pick is a wrong number |
| Transcription | Groq Whisper | Speed |
| Parsing food lines, sets, run descriptions | Groq | Speed |

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

---

## 11. Conventions

**Copied from the photo app** (`ARCHITECTURE.md`): server-component pages + `*Client` + `usePoll`; mutations return the full refreshed view model; no Server Actions; `withUser`; tagged-template SQL, no ORM; additive, deploy-safe migrations starting at `001_*.sql`, each opening with a why-comment; derive state rather than store it where possible; DB constraints over app-level invariants; `sql.begin` with `select … for update` for writes that touch both users; comments that explain why; the dark graphite theme, Nunito, the identity colors, and the copy voice.

**Different from the photo app, because this is a different kind of app:**

- **Data is editable.** Food entries, sets, weigh-ins, and foods can be edited and deleted. Entries carry snapshots so editing a food doesn't change history.
- **Time is the phone's local date**, not a fixed anchor timezone.
- **Numbers and charts are core.** Keep the no-dependency habit if practical (hand-rolled SVG charts), but that's the implementing agent's call.
- **External APIs:** Claude and Gemini for reading and picking, Groq for transcription and parsing. No Blob storage, no push.
- **Self-hosted**, not serverless (§3).
- **Some derived numbers are stored.** Expenditure estimates and target proposals are rows, because each one is a decision made at a point in time. Daily totals and trends are still derived on read.
- **Domain logic lives in `lib/health/` service functions** that both the route handlers and the MCP tools call. The MCP is a first-class client, not an add-on.

---

## 12. Build order

**Already built in Bunnybear:** the food library and label reading (old step 1), the reference table (1a), log entries, macro bar and targets (2), quick log (3), recents, saved meals and shared meals (4), and a Claude connector with `get_day`, `log_food`, `undo_last`, `search_foods` and `add_food` (4b). Nothing below rebuilds those.

0. **Set up Tummy.** Wipe `thehonestfarmer/tummy` and start it from one fresh commit (a force-push to `main`, confirmed with Bear right before). Copy in the Health code and the ported patterns (§3). Fold migrations into a fresh `001` sequence. Seed both users. Health routes become the app root; tabs are Today, Train, Trends. New manifest and icons.
1. **Apply the changes in this spec to the moved code:**
   - remove the Siri Shortcut and Vercel Blob
   - photos waiting for review live on a volume, deleted on confirm or discard (§5.3)
   - the Gemini path in `vision.ts`, ready for the comparison (§9)
   - `client` and `confirmed_via` on foods, entries, and sets
   - the label-as-printed contract and the MCP food tools from `mcpspec.md` §11 step 2, including chat confirmation
2. **Deploy.** The Singapore VPS, Docker, Caddy, the GitHub Action, the Neon project, migrations and `seed:reference`, cron (keep-alive, backup, photo prune), the domain. Smoke-test the routes, then reconnect each person's Claude connector to the new URL.
3. **Seed the library and run the vision comparison.** Bulk-upload the kitchen; review in the PWA; also try seeding from Claude to test chat confirmation. Pick the vision model from the results. **This is the first real test.**
4. **Remove Health mode from Bunnybear** (§3).
5. Remaining MCP tools through `mcpspec.md` §11 step 5 (context, guidance, `needs_choice`, edits, duplicate protection)
6. Weigh-ins and the 7-day trend, `trend_only` setting
7. Training logger: plans, exercises, touch logging
8. Voice set logging
9. Runs: voice and screenshot
10. Adaptive expenditure and proposals
11. Trends screen

**Ship point:** after step 3, food tracking is complete and usable on its own. Steps 5–11 are additive.

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

1. **The name, icon, and domain.** Settle the name and icon before either of us installs the app (see the note at the top).
2. **ChatGPT.** Check again, before Bunny relies on it, whether ChatGPT accepts a secret in the connector URL and whether write tools run in its mobile apps (`mcpspec.md` §12). Claude remains the dependable path.
3. **Neon cold starts.** On the free tier, Neon suspends after about 5 minutes idle and wakes in roughly half a second to a second. The cron keep-alive covers it; if that isn't enough, a paid plan can turn auto-suspend off.
4. **Quick-log latency.** The target is under about 3 seconds from release to "Added" on a deterministic match. Measure Whisper + parse + match on real devices over mobile data. If it's slow, the parse step for simple sentences may need a smaller model.
5. **Mic prompts on iOS.** Accepted for now. Measure how often it asks in the first week; the options are in §3.
6. **Charts.** Hand-rolled SVG or a small library.

---

## 15. Settled parameters

| Parameter | Value |
|---|---|
| Placement | Separate PWA: own repo, own database, own domain; no links to or from the photo app |
| Starting point | The Health mode built in Bunnybear, moved in; not rebuilt |
| Repo | `thehonestfarmer/tummy`, old code discarded |
| Hosting | Singapore VPS, Docker + Caddy, images built off the box. Not Vercel, not proxied through Vercel, not Supabase. |
| Database | New Neon project, Singapore |
| Bunnybear afterward | Mode toggle and Health routes removed; tables left in place |
| Identity | Same PINs, marks, and colors as the photo app |
| Name | Tummy, as a working name; final before install |
| Health day | Phone's local calendar date, sent in a cookie |
| Library | Shared between both users |
| Library seeding | Bulk photo upload + review queue in the PWA, and from chat |
| Photos per pack | One (the back) by default; optional second for brand |
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
| Shared meal default split | 50/50, adjustable |
| Who logs shared meals | Either person, into both days |
| Partner visibility | Food, training, runs, targets visible; weight respects `trend_only` |
| Target changes | Propose and approve, every 14 days; energy balance is signed |
| Calories and training | Training never changes the day's target |
| Logging frequency | 10–20 logs per person per day; snacks included |
| Quick log | One utterance; auto-commit with undo on a clear match, confirm only the uncertain item |
| Quick-log entry points | In-app mic (or typed), and Claude or ChatGPT via MCP — one server function. No Siri Shortcut. |
| Voice | Push-to-talk, Groq Whisper. iOS mic re-prompts accepted for now. |
| Transcription and parsing | Groq |
| DB and KB loads | Stored per hand, flagged |
| Strava | Cut. Runs via voice or screenshot. |
| Steps / Apple Health | Out of v1 |
| Weigh-ins | Manual |
| Security | Lax; two private users |
