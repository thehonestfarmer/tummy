/*
 * Each person's guidance (mcpspec.md §7): the house rules an assistant reads
 * before giving advice, in named sections. Targets are not stored here; they
 * are merged in live from `targets`, so the two can never disagree.
 * Either of you can edit either person's guidance.
 */
create table if not exists guidance (
  user_id    integer not null references users(id) on delete cascade,
  section    text not null check (section in
               ('standing_rules', 'fasting', 'safety_stops', 'weight', 'training', 'tone')),
  body       text not null,
  updated_by integer references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

/*
 * A question a tool asked and is waiting on (mcpspec.md §4.4): which food
 * "senbei" meant, what one piece weighs, whether a label is one we already
 * have. The token goes to the assistant, which asks the person and answers
 * with resolve_choice. What was said is kept here, not in the chat, so the
 * answer is applied to exactly what was asked about.
 */
create table if not exists choices (
  token      text primary key,
  user_id    integer not null references users(id) on delete cascade,
  kind       text not null check (kind in ('log_item', 'duplicate')),
  payload    jsonb not null,
  client     text not null check (client in ('pwa', 'claude', 'chatgpt')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists choices_expiry_idx on choices (expires_at);

/*
 * Recent writes over MCP, so a retried tool call returns the first call's
 * result instead of logging the snack twice (mcpspec.md §10). Matched by the
 * same user, tool and arguments within a minute, or by the caller's own
 * request id. Rows older than a day are only ever deleted.
 */
create table if not exists mcp_writes (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  tool       text not null,
  args_hash  text not null,
  request_id text,
  result     jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists mcp_writes_recent_idx on mcp_writes (user_id, tool, args_hash, created_at desc);
create unique index if not exists mcp_writes_request_idx on mcp_writes (user_id, request_id) where request_id is not null;
