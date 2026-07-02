create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_code text not null unique check (player_code ~ '^GRACZ-[A-F0-9]{8}$'),
  display_name text not null check (char_length(display_name) between 2 and 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists availability_day_idx on public.availability(day);

create table if not exists public.player_invites (
  id uuid primary key default gen_random_uuid(),
  player_code text not null unique check (player_code ~ '^GRACZ-[A-F0-9]{8}$'),
  activation_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists availability_set_updated_at on public.availability;
create trigger availability_set_updated_at
before update on public.availability
for each row execute function public.set_updated_at();

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

revoke all on function public.is_active_member() from public;
grant execute on function public.is_active_member() to authenticated;

alter table public.profiles enable row level security;
alter table public.availability enable row level security;
alter table public.player_invites enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.availability from anon, authenticated;
revoke all on public.player_invites from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.availability to authenticated;

drop policy if exists "active members can view active profiles" on public.profiles;
drop policy if exists "members can update their own profile" on public.profiles;
drop policy if exists "active members can view availability" on public.availability;
drop policy if exists "members can add only their own availability" on public.availability;
drop policy if exists "members can update only their own availability" on public.availability;
drop policy if exists "members can delete only their own availability" on public.availability;

create policy "active members can view active profiles"
on public.profiles for select
to authenticated
using (public.is_active_member() and is_active = true);

create policy "members can update their own profile"
on public.profiles for update
to authenticated
using (public.is_active_member() and id = auth.uid())
with check (public.is_active_member() and id = auth.uid());

create policy "active members can view availability"
on public.availability for select
to authenticated
using (public.is_active_member());

create policy "members can add only their own availability"
on public.availability for insert
to authenticated
with check (public.is_active_member() and user_id = auth.uid());

create policy "members can update only their own availability"
on public.availability for update
to authenticated
using (public.is_active_member() and user_id = auth.uid())
with check (public.is_active_member() and user_id = auth.uid());

create policy "members can delete only their own availability"
on public.availability for delete
to authenticated
using (public.is_active_member() and user_id = auth.uid());

create or replace function public.issue_player_invite(
  p_valid_for interval default interval '30 days'
)
returns table (player_code text, activation_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_code text;
  v_activation_code text;
  v_expires_at timestamptz;
begin
  loop
    v_player_code := 'GRACZ-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (select 1 from public.player_invites i where i.player_code = v_player_code)
      and not exists (select 1 from public.profiles p where p.player_code = v_player_code);
  end loop;

  v_activation_code := 'AKTYWUJ-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 16));
  v_expires_at := now() + p_valid_for;

  insert into public.player_invites (player_code, activation_hash, expires_at)
  values (v_player_code, encode(digest(v_activation_code, 'sha256'), 'hex'), v_expires_at);

  return query select v_player_code, v_activation_code, v_expires_at;
end;
$$;

revoke all on function public.issue_player_invite(interval) from public, anon, authenticated;

-- Realtime: kalendarz i zmiany nazw odświeżają się u wszystkich zalogowanych osób.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table public.availability;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
