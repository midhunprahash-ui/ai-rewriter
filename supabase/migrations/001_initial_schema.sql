create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  default_mode text not null default 'professional_report',
  monthly_quota integer not null default 100 check (monthly_quota >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rewrites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_text text not null check (char_length(original_text) between 1 and 12000),
  rewritten_text text not null,
  mode text not null,
  strength text not null,
  length_mode text not null,
  warnings jsonb not null default '[]'::jsonb,
  preserved_items jsonb not null default '[]'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_type text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx
  on public.profiles (email);

create index if not exists rewrites_user_created_idx
  on public.rewrites (user_id, created_at desc);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

create index if not exists usage_events_user_type_created_idx
  on public.usage_events (user_id, event_type, created_at desc);

create index if not exists templates_user_created_idx
  on public.templates (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.rewrites enable row level security;
alter table public.usage_events enable row level security;
alter table public.templates enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_templates_updated_at on public.templates;
create trigger set_templates_updated_at
before update on public.templates
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "rewrites_select_own" on public.rewrites;
create policy "rewrites_select_own"
on public.rewrites
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "rewrites_insert_own" on public.rewrites;
create policy "rewrites_insert_own"
on public.rewrites
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "rewrites_delete_own" on public.rewrites;
create policy "rewrites_delete_own"
on public.rewrites
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
on public.usage_events
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
on public.usage_events
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own"
on public.templates
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own"
on public.templates
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "templates_update_own" on public.templates;
create policy "templates_update_own"
on public.templates
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own"
on public.templates
for delete
to authenticated
using (user_id = (select auth.uid()));
