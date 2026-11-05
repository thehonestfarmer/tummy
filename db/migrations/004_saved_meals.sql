/*
 * Saved meals (healthspec.md §5.6): a named list of foods with grams, "usual
 * lunch", logged in one tap. Grams are per person. A shared saved meal logs
 * the same list into both of your days, which is what "usual dinner" means
 * when you both eat it.
 */
create table if not exists saved_meals (
  id         serial primary key,
  name       text not null,
  shared     boolean not null default false,
  created_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists saved_meals_name_idx on saved_meals (lower(name));

create table if not exists saved_meal_items (
  id       serial primary key,
  meal_id  integer not null references saved_meals(id) on delete cascade,
  food_id  integer not null references foods(id) on delete cascade,
  grams    double precision not null check (grams > 0),
  position integer not null default 0
);

create index if not exists saved_meal_items_meal_idx on saved_meal_items (meal_id, position);
