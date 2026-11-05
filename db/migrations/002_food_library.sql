/*
 * MEXT's 日本食品標準成分表 (八訂), the generic food table that anything without
 * a printed label is matched against (healthspec.md §5.8). Kept apart from
 * `foods`: this is reference data loaded from db/reference/ by
 * `bun run seed:reference`, never edited in the app, and only ever cited.
 *
 * `search_key` is the name folded for matching: width-normalised, katakana as
 * hiragana, with no spaces or brackets. The table writes いか where a packet
 * says イカ, and both should find the same row.
 */
create table if not exists reference_foods (
  id          serial primary key,
  food_number text not null unique,
  food_group  text not null,
  name        text not null,
  search_key  text not null,
  kcal        double precision,
  protein_g   double precision,
  fat_g       double precision,
  carbs_g     double precision
);

/*
 * The food library (healthspec.md §5.1). One library,
 * shared by both of you: the same packet of senbei is the same food whoever
 * photographed it.
 *
 * Macros are always per 100g. A label printed per piece or per bag is
 * normalised by the server at confirm time, never by the model, so these
 * columns hold numbers someone has looked at.
 *
 * `status` is stored rather than derived, because confirming a food is a
 * decision a person makes, not a fact the other rows imply. Everything about
 * *reading* a draft (still reading, failed, ready) is derived from
 * `food_readings` instead, the same way day state follows from photos.
 */
create table if not exists foods (
  id            serial primary key,
  name          text,
  name_ja       text,
  brand         text,
  -- Every way we have referred to it, in any script. Grows as voice logging
  -- resolves new phrases (§5.5), and is seeded with the model's suggestions.
  aliases       text[] not null default '{}',
  kcal          double precision,
  protein_g     double precision,
  fat_g         double precision,
  carbs_g       double precision,
  weight_basis  text not null default 'raw' check (weight_basis in ('raw', 'cooked', 'as_packaged')),
  default_grams double precision check (default_grams is null or default_grams > 0),
  -- Null only while a photo draft has not been read, since until then nobody
  -- knows whether it is a nutrition label or a meat pack.
  source        text check (source in ('label_ocr', 'pack_read', 'reference_table', 'llm_estimate', 'manual')),
  /*
   * Where it was submitted from, and where a person said yes to it
   * (mcpspec.md §8). Either of us can confirm in the app or in a chat; the
   * server can't see that a person looked in a chat, so this is what lets a
   * bad batch be traced back.
   */
  client        text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  confirmed_via text check (confirmed_via in ('pwa', 'claude', 'chatgpt')),
  status        text not null default 'draft' check (status in ('draft', 'confirmed')),
  /*
   * The packet's photos, only while the draft waits for review. Cleared, and
   * the files deleted, once it is confirmed or discarded (healthspec.md §5.3).
   */
  image_url     text,
  image2_url    text,
  /*
   * Which reference row the values came from, or, for a label, which generic
   * row it was checked against (§5.8). `reference_candidates` holds the rows
   * the matcher offered, so the reviewer can pick a different one without
   * searching again.
   */
  reference_food_id    integer references reference_foods(id) on delete set null,
  reference_candidates integer[] not null default '{}',
  -- A food added by name, with no photo, waiting to be matched or estimated.
  requested_name text,
  /*
   * The label exactly as the reviewer confirmed it was printed: the ground
   * truth each model's reading is scored against (§5.3, §9). Written once, at
   * first confirmation; later edits to the food leave it alone, because they
   * correct the food, not what the packet said.
   */
  reading       jsonb,
  created_by    integer references users(id) on delete set null,
  confirmed_by  integer references users(id) on delete set null,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A confirmed food is one the logger can count against, so it must be complete.
  constraint confirmed_foods_are_complete check (
    status = 'draft' or (
      name is not null and source is not null and kcal is not null and
      protein_g is not null and fat_g is not null and carbs_g is not null
    )
  )
);

create index if not exists foods_status_idx on foods (status, created_at);

/*
 * Named servings: "1 piece = 9g", "1 pack = 180g". Counted snacks need a
 * piece serving for "1 senbei" to resolve by voice without a follow-up.
 */
create table if not exists food_servings (
  id      serial primary key,
  food_id integer not null references foods(id) on delete cascade,
  label   text not null,
  grams   double precision not null check (grams > 0),
  unique (food_id, label)
);

/*
 * What each model read off a draft's photos, kept beside the confirmed
 * reading so accuracy is measured from real corrections rather than guessed.
 * Several rows per food while two models are being compared side by side.
 *
 * `is_primary` marks the reading the review screen pre-fills from. Exactly one
 * of `output` and `error` is set: a reading either came back or it did not.
 */
create table if not exists food_readings (
  id         serial primary key,
  food_id    integer not null references foods(id) on delete cascade,
  model      text not null,
  -- The model that actually answered, which differs from `model` only when a
  -- server-side fallback took over after a refusal.
  served_by  text,
  is_primary boolean not null,
  output     jsonb,
  error      text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  constraint reading_or_error check ((output is null) <> (error is null))
);

create index if not exists food_readings_food_idx on food_readings (food_id);
create unique index if not exists one_primary_reading
  on food_readings (food_id) where is_primary;
