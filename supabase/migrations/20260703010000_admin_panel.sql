-- Panel administratora: prywatna rola administratora i rejestrowanie aktywności użytkowników.
-- Uruchom ten plik jeden raz w SQL Editor właściwego projektu Supabase.

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists user_activity_last_seen_idx
on public.user_activity(last_seen_at desc);

alter table public.admin_users enable row level security;
alter table public.user_activity enable row level security;

revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.user_activity from public, anon, authenticated;
grant all on public.admin_users to service_role;
grant all on public.user_activity to service_role;
grant execute on function public.issue_player_invite(interval) to service_role;

create or replace function public.touch_user_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Brak dostępu';
  end if;

  insert into public.user_activity (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
  set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.touch_user_activity() from public, anon;
grant execute on function public.touch_user_activity() to authenticated;

do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from public.profiles
  where player_code = 'GRACZ-084E77E9';

  if v_admin_id is null then
    raise exception 'Nie znaleziono konta administratora: GRACZ-084E77E9';
  end if;

  delete from public.admin_users;
  insert into public.admin_users (user_id) values (v_admin_id);
end $$;
