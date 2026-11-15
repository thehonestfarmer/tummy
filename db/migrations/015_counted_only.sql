/*
 * A food whose label gives its numbers for one pack, piece or serving and
 * no weight (healthspec.md §5.1). Nothing is known per 100g, so the one unit
 * is stored as a nominal 100g: every sum still works, and the screens show
 * "1 pack" in place of grams that nobody measured.
 */
alter table foods add column if not exists counted_only boolean not null default false;
