/*
 * Either of us can log a set for the other from a chat ("Bunny did 20 for
 * 10"), as with a shared meal (healthspec.md §7.4). `user_id` is whose set it
 * is; `entered_by` is who typed it. Null on rows from before this existed,
 * which were all entered by their owner.
 */
alter table sets add column if not exists entered_by integer references users(id) on delete set null;
