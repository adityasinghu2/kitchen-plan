-- Kitchen Plan tracker: schema and security policies.
-- Paste this whole file into the Supabase SQL editor and press Run. Once.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  display_name   text,
  kcal_target    integer not null default 1471,
  protein_target integer not null default 153,
  loud_day       integer not null default 2200,
  created_at     timestamptz not null default now()
);

create table if not exists public.foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  kcal       numeric not null check (kcal >= 0),
  protein    numeric not null default 0 check (protein >= 0),
  unit       text not null default 'serving',
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  log_date   date not null,
  slot       text not null default 'other',
  name       text not null,
  kcal       numeric not null check (kcal >= 0),
  protein    numeric not null default 0 check (protein >= 0),
  servings   numeric not null default 1 check (servings > 0),
  source     text not null default 'custom',
  created_at timestamptz not null default now()
);

create table if not exists public.weights (
  user_id  uuid not null references auth.users on delete cascade,
  log_date date not null,
  kg       numeric not null check (kg > 0),
  primary key (user_id, log_date)
);

create index if not exists entries_user_date_idx on public.entries (user_id, log_date);
create index if not exists foods_user_idx        on public.foods   (user_id);

-- ------------------------------------------------- row level security
-- With these on, the database refuses to return another account's rows
-- even if someone gets hold of the public API key. This is the part that
-- makes the app genuinely multi-user rather than trust-based.

alter table public.profiles enable row level security;
alter table public.foods    enable row level security;
alter table public.entries  enable row level security;
alter table public.weights  enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own foods" on public.foods;
create policy "own foods" on public.foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own weights" on public.weights;
create policy "own weights" on public.weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------- create a profile on signup

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
