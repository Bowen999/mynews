-- MyNews: multi-user accounts (Supabase Auth). Run after 0001_init.sql.
-- Each auth user owns one profile; runs carry their notification targets.
-- Data is still accessed only server-side with the service-role key (RLS on, no policies).

alter table public.profiles add column if not exists owner_id text;
create unique index if not exists profiles_owner_id_key on public.profiles (owner_id) where owner_id is not null;

alter table public.runs add column if not exists notify jsonb;
create index if not exists runs_created_idx on public.runs (created_at desc);
