-- MyNews: implicit feedback for learning what each reader cares about. Run after 0002_accounts.sql.
-- One row per story opened / source clicked (ids are per item, kind and day, so repeats are ignored).

create table if not exists public.interactions (
  id         text primary key,
  profile_id text not null references public.profiles(id) on delete cascade,
  edition_id text not null references public.editions(id) on delete cascade,
  item_id    text not null,
  category   text not null,
  kind       text not null check (kind in ('open', 'source')),
  created_at timestamptz not null default now()
);
create index if not exists interactions_profile_created_idx on public.interactions (profile_id, created_at desc);

alter table public.interactions enable row level security;
