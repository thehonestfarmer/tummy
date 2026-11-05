# Tummy — MCP spec

*(Tummy is the working name.)*

The MCP server for Tummy, a standalone PWA separate from the Bunnybear photo app. Read this alongside `healthspec.md` (the product) and `ARCHITECTURE.md` (the photo app, whose patterns this app copies). Where this file and `healthspec.md` disagree about the MCP, this file wins.

A first version was built inside Bunnybear (`src/lib/health/mcp.ts`, `/api/mcp/[token]`) with `get_day`, `log_food`, `undo_last`, `search_foods`, and `add_food`. It moves into Tummy with the rest of the Health code and is extended to this spec.

---

## 1. Purpose

One server holds all health state for Bunny and Bear. Every surface reads and writes through the same server functions:

- **Claude** (claude.ai, desktop, mobile) as a remote MCP connector
- **ChatGPT** (developer mode) as a remote MCP connector
- **The PWA**, which calls the same server functions directly (not over MCP)

No Siri Shortcut.

A day of use looks like this, and all of it lands in one place:

1. Bear uploads a stack of kitchen photos in Claude. Claude reads each label and submits the values. Bear checks them in the chat and says yes. They're saved to the shared library. (Or he bulk-uploads them in the PWA and works through the review queue; either way ends in the same place.)
2. Bear opens the PWA and says "2 eggs and 100g rice." Two entries go on his day.
3. Bunny tells ChatGPT (or Claude; see §12) "we split a steak, about 300g." One entry goes on each person's day, and Bear's shows "added by Bunny."
4. Later, Bunny asks Claude "how much protein do I have left?" and gets the same number the PWA shows.

---

## 2. Principles

**The app owns the facts; the assistant owns the conversation.** A chat assistant is a client of Tummy, the same as the phone. It is never a place where nutrition data lives. Using a chat thread as the food database fails quietly: a label scanned three weeks ago is somewhere back in the conversation, or summarised, or gone, and the model fills the gap with a plausible number stated as confidently as a real one. Every principle below exists to rule that out.

1. **Identity comes from the connection.** Each connector is authenticated as one person. The server knows who is calling from the token, never from a field the model fills in. The only cross-user write is a shared meal.
2. **The server does all the math.** Per-100g conversion, servings, totals, trends, expenditure, and proposals are computed on the server. Models never send computed totals, and the server ignores any they do send.
3. **Text is parsed on the server.** Free-text logging ("just had 1 shoyu senbei", "press 7.5 for 12, 12, 10") goes through the server's own parser (`quickLog` and its training equivalent, on Groq). Claude and ChatGPT then log identically.
4. **Images are read by whoever has them.** In Claude or ChatGPT, the app's own model reads the photo and submits the label as printed. In the PWA, the server sends the photo to Claude or Gemini vision and gets the same structure back. **No photo is kept**: the server never sees a chat's photos, and a PWA photo is deleted once its draft is reviewed.
5. **Nothing is confirmed without a person seeing the values.** The rule is the same in every surface: show the parsed values, get a yes, then save as confirmed. Both of us can confirm in the PWA or in a chat.
6. **No tool that commits a log entry accepts macros.** `log_food` takes words, or a food id with grams. A number the model invented has nowhere to go.
7. **No match means the tool says so.** An unresolved phrase comes back as `needs_choice` with candidates. It never falls back to an estimate.
8. **Fresh reads, every time.** Tool descriptions say: look it up, don't remember it. "What did I eat today?" means calling `get_context` or `get_day`, never reading back over the chat. Every food in a result carries its id and where its numbers came from (label, reference row, or estimate).
9. **Every write is tagged with its client** (`pwa`, `claude`, `chatgpt`) and its acting user.
10. **The rules live on the server.** Tool descriptions, the server's instructions, and `get_guidelines` carry the house rules, so no surface depends on its own prompt being written correctly.

---

## 3. Surfaces

| Surface | Reaches the server through | Food text | Label photos | Confirmation |
|---|---|---|---|---|
| Claude | Remote MCP | `log_food` → server parser | Claude reads the photo → `add_food` with the label as printed | Claude shows values in chat; user says yes |
| ChatGPT | Remote MCP (developer mode) | Same | ChatGPT reads the photo → `add_food` | Same |
| PWA | Server functions directly | Mic or typing → server parser | Upload → server → Claude or Gemini vision (picked by comparison, `healthspec.md` §9) → same structure → photo deleted after review | Confirm screen or review queue |
The PWA does not go through MCP. MCP tools and PWA route handlers are both thin wrappers around the same functions in `lib/health/`.

---

## 4. Data contract

### 4.1 Label as printed (what a reader submits)

Whoever reads a label, whether Claude or ChatGPT in a chat or the vision model behind the PWA, submits exactly this. Values are copied off the label, not converted.

| Field | Required | Notes |
|---|---|---|
| name | yes | English display name |
| name_ja | if printed | Product name as printed |
| generic_name | if printed | 名称 from the 一括表示 box (e.g. 米菓) |
| brand | if visible | Usually on the front |
| basis | yes | What the printed values are per: `per_100g`, `per_100ml`, `per_package`, `per_serving`, or `per_piece` |
| basis_grams | unless basis is per 100g | The grams that basis refers to, e.g. 1袋(60g)あたり → 60 |
| kcal, protein_g, fat_g | yes | As printed for that basis |
| carbs_g | one of these | As printed, if the label gives 炭水化物 |
| sugars_g + fiber_g | one of these | If the label splits 糖質 and 食物繊維 |
| net_weight_g | if printed | 内容量 |
| piece_count | if printed | e.g. 12枚, 8個 |
| weight_basis | yes | `raw` (default), `cooked`, or `as_packaged` |
| kind | yes | `label` (read from a nutrition panel) or `estimate` (no panel; values from the model's knowledge, as for a meat pack or "chicken breast, skinless") |

**The server derives:** per-100g values, carbs as sugars + fiber when split, the "1 pack" serving from net weight, the "1 piece" serving from net weight ÷ piece count (or from `basis_grams` when the basis is per piece), the plausibility check (protein×4 + carbs×4 + fat×9 within 15% of kcal), and the reference cross-check (more than 50% off the nearest MEXT row on calories, `healthspec.md` §5.8). The printed values are stored alongside the derived ones as the audit trail.

**Estimates go through the reference table.** For `kind: estimate` (a meat pack, "chicken breast, skinless"), the server first matches the name to a MEXT row and uses that row's values, returning the row's name so the person sees it before confirming. The model's own numbers are used only when no row fits, and the food is flagged as an estimate.

### 4.2 Food (what readers get back)

id, name, name_ja, brand, aliases, per-100g values, weight basis, servings (name + grams), default grams, status (`draft` or `confirmed`), source client, printed label fields, created by, updated at.

### 4.3 Entry

id, user, food id (nullable), food name snapshot, grams, macros (computed from the snapshot), local date, logged at, timezone, shared meal id, created by, client.

### 4.4 Responses

**Every write returns what changed plus the acting user's updated day summary** (consumed, target, remaining). The model can then say "Added 2 eggs. 1,240 of 1,925 kcal left" without a second call. This mirrors the app's convention of mutations returning the full refreshed view.

**Uncertainty returns a choice, not a guess.** When the server can't resolve something, it returns `status: needs_choice` with:
- the item it's unsure about
- the candidates (or the question, e.g. "how many grams is one piece?")
- a short-lived resolution token

The model asks the person, then calls `resolve_choice` with the token and the answer. This replaces the PWA's undo toast in chat.

**Errors** are plain user-facing sentences, matching the app's `withUser` pattern ("No food called 'senbei' yet. Want to add one?").

---

## 5. Tools

About 25 tools. Each description states its rules plainly, because the description is the only prompt the server controls in a chat app.

### Context and guidance

| Tool | Does |
|---|---|
| `get_context` | One compact summary for the acting user: today's totals and remaining, the active target, the 7-day weight trend (respecting trend-only), today's session plan and logged sets, the last 10 foods logged, and any pending target proposal. **Models should call this first** for any question about today. |
| `get_guidelines` | The acting user's guidance (§7), with live targets merged in. Models should call this before giving any nutrition or training advice. |
| `update_guidelines` | Replace one section of a user's guidance. Either user can edit either user's guidance. |
| `get_day` | Entries, totals, and target for a user and date. |
| `get_history` | Daily totals, weigh-ins, or sessions over a date range, for trend questions. |

### Food library

| Tool | Does |
|---|---|
| `search_foods` | Search names and aliases in both languages. Returns confirmed foods by default; drafts on request. |
| `add_food` | Submit a label as printed (§4.1). `confirmed: true` only if the person has seen the values and said yes in this conversation. Several items can be sent in one call. Returns the derived food(s), any reference row used, and any warnings. Before creating, the server checks for a likely existing match and returns `needs_choice` if one exists. An unconfirmed submission is a draft, which also appears in the PWA's review queue. |
| `confirm_food` | Confirm a draft, optionally with corrections. Works on drafts from any surface, including ones read in the PWA. |
| `update_food` | Edit any field of a food, including adding aliases or servings. Past entries keep their snapshots. |

### Food logging

| Tool | Does |
|---|---|
| `log_food` | **The main logging tool.** Takes the person's words as text ("just had 1 shoyu senbei", "we split a steak, about 300g") and runs them through the server parser. Clear matches commit; anything uncertain comes back as `needs_choice`. **Never accepts macros.** |
| `log_food_items` | Structured logging for when the model already has food ids: food id, grams or a serving name and count, optional `shared` with a split. |
| `resolve_choice` | Answer a `needs_choice`. |
| `edit_entry` | Change grams, date, or time of any entry. |
| `delete_entry` | Delete any entry. For a shared meal, deletes only the acting user's half unless `both: true`. |
| `undo_last` | Remove the acting user's most recent entry. |

### Weight and targets

| Tool | Does |
|---|---|
| `log_weigh_in` | Weight (and optional waist) for a date. Upserts. |
| `get_weigh_ins` | Raw values and the 7-day trend. For a trend-only user, raw values are never returned, to anyone. |
| `get_targets` | Active target, history, and any pending proposal. |
| `get_expenditure` | Back-calculated expenditure estimates over time, with the data each used. |
| `request_proposal` | Compute a target proposal now instead of waiting for the 14-day cycle. |
| `approve_proposal` / `dismiss_proposal` | Act on a pending proposal. **The description says: only when the person asks for this directly, never in the same turn the model suggested it.** |

### Training

| Tool | Does |
|---|---|
| `push_session_plan` | Create or replace a session plan for a user and date, using the structure in `healthspec.md` §7.1 (blocks, exercises, prescription text, rep ranges, target RIR, start loads). |
| `get_session` | A session's plan and logged sets. |
| `log_sets` | Free text ("press 7.5 for 12, 12, 10, 9", "bag EMOM, 8 out of 10") parsed on the server against the session plan. Works live or after the session. |
| `edit_set` / `delete_set` | Any set. |
| `finish_session` | Session rating out of 10 and an optional note. |
| `get_exercise_history` | Sets for one exercise over a date range. |
| `log_run` | Free text, or structured fields read from a screenshot by the app's model (duration, distance, pace, average HR). |

---

## 6. Rules carried in tool descriptions

These go in the relevant tool descriptions and in the server's instructions:

- Weigh raw unless the person says cooked.
- Copy label values exactly as printed. Don't convert to per 100g, and don't add servings up. The server does that.
- Don't save anything as confirmed unless the person saw the values and said yes. Show any warnings and any reference row with the values.
- Never state calories or macros from memory or from earlier in the conversation. Look them up.
- Don't estimate macros for a food already in the library. Search first.
- Training never changes the day's calorie target.
- Weight is judged on the 7-day trend. Never show a trend-only user's daily weights.
- Never approve a target proposal unprompted.
- For any advice, call `get_guidelines` first and follow it.

---

## 7. Guidance (per user)

Each user has a guidance document stored on the server, in named sections. `get_guidelines` returns it with live targets merged in. Claude can update it through `update_guidelines` when the program changes, and every app picks up the change.

**Sections**

1. **Targets** — live from the database: kcal, protein, fat, carbs, and the chosen split
2. **Standing rules** — what to prioritize when cutting, the fat floor, same target every day
3. **Fasting** — how to break a fast, hydration, and stop signs
4. **Safety stops** — symptoms that override the plan
5. **Weight** — how weigh-ins are shown and judged
6. **Training** — current program notes and constraints
7. **Tone** — how to talk to this person

**Seed content**, from `nutrition-targets-oct2026.md` and the session docs in the Snacky Chan project (where these live is still to be confirmed, §12):

| Section | Bear | Bunny |
|---|---|---|
| Standing rules | Same target every day, including the 20K-step day (optional +200–250 kcal, protein-led, if hunger is high). Protein first. Gaining slowly: a surplus of about +250 kcal/day. Fat floor ~45g. | Same target every day. Protein first; in a deficit, cut carbs or fat, never protein. Fat floor ~45g. |
| Fasting | Hit full calories and protein inside the window. Break the fast with ~40g protein, then the main meal. Salt water during the fast. | Same |
| Safety stops | Dizziness, shakiness, lightheadedness, or a racing heart means eat now, whatever the plan. Hunger alone doesn't. | Same |
| Weight | Daily weigh-ins; judge by the 7-day average. Expect water swings from sodium, soreness, and fasting. | **Trend only. Never state a daily weight.** Waist measured weekly. Same water-swing caveats. |
| Training | Check the back traffic light each morning; if it isn't green, swap loaded hinges for the plan's alternative. | Double progression on dumbbell work; 2.5kg is the smallest jump. |
| Tone | Direct, numbers-first. | Plain and encouraging; lead with what to do. |

Seeded from this table by `scripts/seed.mjs`, since the source docs live in a claude.ai project rather than the repo, with the targets merged in live. Bear reviews them before launch; either of us, or Claude, can change any section through `update_guidelines`.

---

## 8. Confirmation

The same rule in every surface: **a food is saved as confirmed only after a person has seen its values and said yes.**

- **PWA:** the confirm screen or the review queue, with the photo beside the reading.
- **Claude and ChatGPT:** the model shows the parsed label (name, basis, values, net weight, piece count) and asks. On yes, it calls `add_food` with `confirmed: true`. For a batch, it can show all of them and take one yes for the set.
- The server can't verify that a person saw the values. It relies on the tool description, and records `confirmed_via` (`pwa`, `claude`, `chatgpt`) on every food so a bad batch can be traced and fixed.
- A draft started in one place can be confirmed in the other.

Correction tracking (`healthspec.md` §5.3) still applies. When a draft is confirmed with changes, both versions are stored. Chat-confirmed foods record the model's submission as the original.

---

## 9. Visibility

The same as the app. Either user can read the other's food, training, runs, and targets. Weight follows each user's display setting: for a trend-only user, no surface ever returns raw values.

---

## 10. Reliability

- **Duplicate protection.** Chat apps sometimes retry a tool call. The server drops an identical write (same user, same tool, same text or payload) within 60 seconds and returns the original result. Writes also accept an optional request id for exact deduplication.
- **Shared meals are one transaction.** Both halves are written together or not at all.
- **Times.** Writes accept an optional local time and timezone. If missing, the server uses the acting user's last known timezone from the PWA.

---

## 11. Build order

The MCP moves up so the library can be seeded from Claude straight away. Steps marked *built* exist in the Bunnybear code being moved over and need adapting, not writing.

1. Service layer in `lib/health/` for foods: the label-as-printed derivation, the plausibility check, the reference cross-check, and duplicate matching (*built*, apart from accepting a chat submission as printed)
2. **MCP server with `search_foods`, `add_food`, `confirm_food`, `update_food`**, with chat confirmation. This is enough to seed the library from Claude and ChatGPT. (`search_foods` and a draft-only `add_food` are *built*.)
3. PWA photo path: upload → Claude or Gemini vision → same structure → confirm, with the two-model comparison (*built* for Claude; Gemini is added)
4. `get_context`, `get_guidelines`, `update_guidelines`, and the seeded guidance (*built*)
5. `log_food`, `log_food_items`, `resolve_choice`, edits, `undo_last`, and duplicate protection (*built*; a second identical call within a minute replays the first result, so two deliberate `undo_last` calls in a minute remove one log)
6. Weight and targets tools
7. Training and run tools

---

## 12. Setup

**Decided**

1. **Auth: one secret connector URL per person**, as built in Bunnybear: `/api/mcp/<secret>` for Claude, and `/api/mcp/<secret>/chatgpt` for ChatGPT. The secret is the whole credential and also says who is calling, so no tool takes a user argument. The suffix only says which client to record on each write: the connection is stateless, so nothing else could. A wrong secret is a 404. Claude's custom connectors can't send a header, so the credential has to be in the URL. If a client refuses this, the fallback is OAuth with the PIN pad as the sign-in page, in front of the same tools.
2. **Hosting:** inside Tummy, on the Singapore VPS at the app's own domain (`healthspec.md` §3). Not part of Bunnybear, and no subdomain. Caddy must pass streamed responses through unbuffered.
3. **Transport:** Streamable HTTP through `mcp-handler`, as built. Claude's connectors accept it.
4. **Moving domains:** each of us re-adds our connector at the new URL after the move.
5. **Claude is the dependable assistant.** Claude's Free plan allows one custom connector, which is all Tummy needs. Connectors work in Claude's mobile apps (add the connector on the web first). "Allow always" on `log_food` removes the per-log prompt.

**Check before relying on ChatGPT**

6. As of October 2026: ChatGPT offers OAuth, "No authentication", or mixed, and can't send an API key or custom header. A secret in the URL path under "No authentication" is undocumented but should work. **Deploy, then connect from Bunny's ChatGPT before building anything that depends on it.**
7. **Write tools may not run in ChatGPT's mobile apps.** Developer reports since late 2025 say they fail there ("MCP write actions are currently disabled"), while read tools work, and docs conflict on whether Plus/Pro accounts get write tools at all. If that still holds, ChatGPT is a read-only window (lookups, trends), and logging and confirming go through the PWA or Claude.
8. Write tools ask for confirmation in ChatGPT unless marked read-only. Mark every read tool `readOnlyHint` so lookups don't prompt.

**Still open**

9. **Tool count:** whether either client limits or degrades with ~25 tools. If so, merge the edit and delete tools into one per kind.
10. **Guidance seed sources:** where `nutrition-targets-oct2026.md` and the Snacky Chan session docs live, for seeding §7.
