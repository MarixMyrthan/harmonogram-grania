-- Pełna aktualizacja Harmonogramu grania:
-- czat, najbliższe terminy, gry i głosowanie, JACKPOT,
-- tryb daltonisty, urządzenia oraz automatyczne porządki.

alter table public.profiles
  add column if not exists colorblind_mode boolean not null default false;

-- Czat grupowy.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx
on public.chat_messages(created_at desc);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated;
grant select, insert on public.chat_messages to authenticated;

drop policy if exists "active members can read chat" on public.chat_messages;
create policy "active members can read chat"
on public.chat_messages for select
to authenticated
using (public.is_active_member());

drop policy if exists "active members can send chat messages" on public.chat_messages;
create policy "active members can send chat messages"
on public.chat_messages for insert
to authenticated
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and char_length(btrim(message)) between 1 and 500
);

-- Zdarzenia dźwiękowe JACKPOT.
create table if not exists public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('jackpot')),
  day date not null,
  created_at timestamptz not null default now()
);

create index if not exists meeting_events_created_at_idx
on public.meeting_events(created_at desc);

alter table public.meeting_events enable row level security;
revoke all on public.meeting_events from public, anon, authenticated;
grant select on public.meeting_events to authenticated;

drop policy if exists "active members can read meeting events" on public.meeting_events;
create policy "active members can read meeting events"
on public.meeting_events for select
to authenticated
using (public.is_active_member());

-- JACKPOT: wszyscy aktywni gracze odpowiedzieli, a nikt nie wybrał "Nie da rady".
-- Status "Jeszcze nie wiem" jest dozwolony.
create or replace function public.emit_jackpot_when_game_possible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer;
  v_new_possible_count integer;
  v_old_possible_count integer;
begin
  select count(*)
  into v_active_count
  from public.profiles
  where is_active = true;

  if v_active_count = 0 then
    return new;
  end if;

  select count(*)
  into v_new_possible_count
  from public.availability a
  join public.profiles p
    on p.id = a.user_id
   and p.is_active = true
  where a.day = new.day
    and a.status in ('available', 'unsure');

  if tg_op = 'INSERT' then
    v_old_possible_count := v_new_possible_count
      - case when new.status in ('available', 'unsure') then 1 else 0 end;
  else
    v_old_possible_count := v_new_possible_count
      - case when new.status in ('available', 'unsure') then 1 else 0 end
      + case when old.status in ('available', 'unsure') then 1 else 0 end;
  end if;

  if v_new_possible_count = v_active_count
     and v_old_possible_count <> v_active_count then
    insert into public.meeting_events (event_type, day)
    values ('jackpot', new.day);
  end if;

  return new;
end;
$$;

revoke all on function public.emit_jackpot_when_game_possible()
from public, anon, authenticated;

drop trigger if exists availability_emit_jackpot on public.availability;
create trigger availability_emit_jackpot
after insert or update of status on public.availability
for each row execute function public.emit_jackpot_when_game_possible();

drop function if exists public.emit_jackpot_when_everyone_available();
drop function if exists public.emit_jackpot_when_meeting_possible();

-- Propozycje gier i głosowanie.
create table if not exists public.meeting_ideas (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  created_at timestamptz not null default now()
);

create unique index if not exists meeting_ideas_unique_title_day_idx
on public.meeting_ideas (day, lower(btrim(title)));

create index if not exists meeting_ideas_day_created_idx
on public.meeting_ideas(day, created_at);

create table if not exists public.meeting_idea_votes (
  idea_id uuid not null references public.meeting_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index if not exists meeting_idea_votes_vote_idx
on public.meeting_idea_votes(idea_id, vote);

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

create or replace function public.is_candidate_game_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_day >= current_date
    and (select count(*) from public.profiles where is_active = true) > 0
    and (
      select count(distinct a.user_id)
      from public.availability a
      join public.profiles p on p.id = a.user_id
      where a.day = p_day
        and p.is_active = true
    ) = (
      select count(*) from public.profiles where is_active = true
    )
    and not exists (
      select 1
      from public.availability a
      join public.profiles p on p.id = a.user_id
      where a.day = p_day
        and p.is_active = true
        and a.status = 'unavailable'
    );
$$;

revoke all on function public.is_candidate_game_day(date) from public;
grant execute on function public.is_candidate_game_day(date) to authenticated;

create or replace function public.touch_meeting_idea_vote_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meeting_idea_votes_touch_updated_at on public.meeting_idea_votes;
create trigger meeting_idea_votes_touch_updated_at
before update on public.meeting_idea_votes
for each row execute function public.touch_meeting_idea_vote_updated_at();

-- Dwa głosy negatywne usuwają propozycję gry.
create or replace function public.remove_rejected_game_idea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.meeting_idea_votes
    where idea_id = new.idea_id
      and vote = 'down'
  ) >= 2 then
    delete from public.meeting_ideas where id = new.idea_id;
  end if;

  return new;
end;
$$;

revoke all on function public.remove_rejected_game_idea() from public;

drop trigger if exists meeting_idea_vote_rejection_threshold on public.meeting_idea_votes;
create trigger meeting_idea_vote_rejection_threshold
after insert or update of vote on public.meeting_idea_votes
for each row execute function public.remove_rejected_game_idea();

alter table public.meeting_ideas enable row level security;
alter table public.meeting_idea_votes enable row level security;

revoke all on public.meeting_ideas from public, anon, authenticated;
revoke all on public.meeting_idea_votes from public, anon, authenticated;

grant select, insert, delete on public.meeting_ideas to authenticated;
grant select, insert, update, delete on public.meeting_idea_votes to authenticated;

drop policy if exists "active members can read meeting ideas" on public.meeting_ideas;
create policy "active members can read meeting ideas"
on public.meeting_ideas for select
to authenticated
using (public.is_active_member());

drop policy if exists "active members can add meeting ideas" on public.meeting_ideas;
create policy "active members can add meeting ideas"
on public.meeting_ideas for insert
to authenticated
with check (
  public.is_active_member()
  and author_id = auth.uid()
  and title = btrim(title)
  and public.is_candidate_game_day(day)
);

drop policy if exists "meeting ideas admins can delete ideas" on public.meeting_ideas;
drop policy if exists "admins can delete meeting ideas" on public.meeting_ideas;
create policy "admins can delete meeting ideas"
on public.meeting_ideas for delete
to authenticated
using (public.is_active_member() and public.is_admin_user());

drop policy if exists "active members can read idea votes" on public.meeting_idea_votes;
create policy "active members can read idea votes"
on public.meeting_idea_votes for select
to authenticated
using (public.is_active_member());

drop policy if exists "members can add their own idea vote" on public.meeting_idea_votes;
create policy "members can add their own idea vote"
on public.meeting_idea_votes for insert
to authenticated
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and exists (
    select 1 from public.meeting_ideas
    where id = idea_id and day >= current_date
  )
);

drop policy if exists "members can update their own idea vote" on public.meeting_idea_votes;
create policy "members can update their own idea vote"
on public.meeting_idea_votes for update
to authenticated
using (public.is_active_member() and user_id = auth.uid())
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and exists (
    select 1 from public.meeting_ideas
    where id = idea_id and day >= current_date
  )
);

drop policy if exists "members can withdraw their own idea vote" on public.meeting_idea_votes;
create policy "members can withdraw their own idea vote"
on public.meeting_idea_votes for delete
to authenticated
using (public.is_active_member() and user_id = auth.uid());

alter table public.meeting_ideas replica identity full;
alter table public.meeting_idea_votes replica identity full;

-- Ostatnie urządzenie użytkownika.
alter table public.user_activity
  add column if not exists device_type text not null default 'unknown',
  add column if not exists operating_system text not null default 'unknown',
  add column if not exists browser text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_activity'::regclass
      and conname = 'user_activity_device_type_check'
  ) then
    alter table public.user_activity
      add constraint user_activity_device_type_check
      check (device_type in ('computer', 'phone', 'tablet', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_activity'::regclass
      and conname = 'user_activity_operating_system_check'
  ) then
    alter table public.user_activity
      add constraint user_activity_operating_system_check
      check (operating_system in ('windows', 'android', 'apple', 'linux', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_activity'::regclass
      and conname = 'user_activity_browser_check'
  ) then
    alter table public.user_activity
      add constraint user_activity_browser_check
      check (browser in ('firefox', 'chrome', 'edge', 'safari', 'opera', 'brave', 'unknown'));
  end if;
end $$;

-- Dni chronione przed automatycznym usuwaniem odpowiedzi.
create table if not exists public.calendar_day_protections (
  day date primary key,
  protected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_state (
  key text primary key,
  last_run_at timestamptz not null default to_timestamp(0)
);

alter table public.calendar_day_protections enable row level security;
alter table public.maintenance_state enable row level security;

revoke all on public.calendar_day_protections from public, anon, authenticated;
revoke all on public.maintenance_state from public, anon, authenticated;
grant all on public.calendar_day_protections to service_role;
grant all on public.maintenance_state to service_role;

drop trigger if exists calendar_day_protections_set_updated_at on public.calendar_day_protections;
create trigger calendar_day_protections_set_updated_at
before update on public.calendar_day_protections
for each row execute function public.set_updated_at();

-- Ręczne czyszczenie czatu przez administratora.
create or replace function public.count_chat_messages_older_than(p_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Liczba dni musi mieścić się w zakresie 1–3650';
  end if;

  select count(*)::integer
  into v_count
  from public.chat_messages
  where created_at < now() - make_interval(days => p_days);

  return v_count;
end;
$$;

create or replace function public.delete_chat_messages_older_than(p_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Liczba dni musi mieścić się w zakresie 1–3650';
  end if;

  delete from public.chat_messages
  where created_at < now() - make_interval(days => p_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.count_chat_messages_older_than(integer) from public, anon, authenticated;
revoke all on function public.delete_chat_messages_older_than(integer) from public, anon, authenticated;
grant execute on function public.count_chat_messages_older_than(integer) to service_role;
grant execute on function public.delete_chat_messages_older_than(integer) to service_role;

-- Porządki uruchamiane najwyżej raz dziennie przy wizycie użytkownika.
create or replace function public.run_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_run timestamptz;
  v_availability integer := 0;
  v_events integer := 0;
  v_ideas integer := 0;
  v_invites integer := 0;
begin
  insert into public.maintenance_state (key, last_run_at)
  values ('daily_cleanup', to_timestamp(0))
  on conflict (key) do nothing;

  select last_run_at
  into v_last_run
  from public.maintenance_state
  where key = 'daily_cleanup'
  for update;

  if v_last_run >= date_trunc('day', now()) then
    return jsonb_build_object('ran', false, 'last_run_at', v_last_run);
  end if;

  delete from public.availability a
  where a.day <= current_date - 7
    and not exists (
      select 1 from public.calendar_day_protections p
      where p.day = a.day
    );
  get diagnostics v_availability = row_count;

  delete from public.meeting_events
  where created_at < now() - interval '30 days';
  get diagnostics v_events = row_count;

  delete from public.meeting_ideas
  where day < current_date;
  get diagnostics v_ideas = row_count;

  delete from public.player_invites
  where (
      consumed_at is not null
      and consumed_at < now() - interval '5 days'
    ) or (
      consumed_at is null
      and expires_at < now() - interval '5 days'
    );
  get diagnostics v_invites = row_count;

  update public.maintenance_state
  set last_run_at = now()
  where key = 'daily_cleanup';

  return jsonb_build_object(
    'ran', true,
    'availability', v_availability,
    'meeting_events', v_events,
    'meeting_ideas', v_ideas,
    'player_invites', v_invites
  );
end;
$$;

revoke all on function public.run_daily_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_maintenance() to service_role;

-- Realtime dla nowych modułów.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_events'
  ) then
    alter publication supabase_realtime add table public.meeting_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_ideas'
  ) then
    alter publication supabase_realtime add table public.meeting_ideas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_idea_votes'
  ) then
    alter publication supabase_realtime add table public.meeting_idea_votes;
  end if;
end $$;

notify pgrst, 'reload schema';
