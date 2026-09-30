-- MyNews: personalized weekly intelligence briefings.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- All access happens server-side with the service-role key. RLS is enabled with no policies,
-- so the public anon key cannot read or write anything.

create table if not exists public.profiles (
  id          text primary key,
  name        text not null,
  sources     jsonb not null default '[]'::jsonb,
  interest    jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.source_snapshots (
  url        text primary key,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.runs (
  id              text primary key,
  profile_id      text not null references public.profiles(id) on delete cascade,
  status          text not null check (status in ('running', 'completed', 'failed', 'needs_input')),
  stage           text not null,
  progress        jsonb not null default '[]'::jsonb,
  log             jsonb not null default '[]'::jsonb,
  state           jsonb not null default '{}'::jsonb,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  base_url        text,
  error           text,
  edition_id      text,
  required_inputs jsonb,
  lease_until     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists runs_profile_created_idx on public.runs (profile_id, created_at desc);

create table if not exists public.editions (
  id              text primary key,
  profile_id      text not null references public.profiles(id) on delete cascade,
  run_id          text,
  number          integer not null,
  headline        text not null,
  dek             text not null default '',
  themes          jsonb not null default '[]'::jsonb,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  items           jsonb not null,
  also_noted      jsonb not null default '[]'::jsonb,
  stats           jsonb not null default '{}'::jsonb,
  profile_summary text,
  model           jsonb,
  sample          boolean not null default false,
  standalone_html text,
  created_at      timestamptz not null default now(),
  unique (profile_id, number)
);
create index if not exists editions_profile_created_idx on public.editions (profile_id, created_at desc);

create table if not exists public.feedback (
  id         text primary key,
  profile_id text not null references public.profiles(id) on delete cascade,
  edition_id text not null references public.editions(id) on delete cascade,
  item_id    text not null,
  item_title text not null,
  category   text not null,
  signal     smallint not null check (signal in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (edition_id, item_id)
);
create index if not exists feedback_profile_created_idx on public.feedback (profile_id, created_at desc);

alter table public.profiles         enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.runs             enable row level security;
alter table public.editions         enable row level security;
alter table public.feedback         enable row level security;
