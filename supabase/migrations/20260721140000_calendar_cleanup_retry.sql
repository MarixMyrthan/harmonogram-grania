-- Harmonogram grania: pewne uruchamianie porządków kalendarza.
-- Wpisy niechronionych dni są usuwane, gdy od ich daty minęło 7 dni.

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
  where (a.day + 7) <= current_date
    and not exists (
      select 1
      from public.calendar_day_protections p
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

-- Pozwala od razu sprawdzić poprawkę i usuwa zaległe, niechronione wpisy.
insert into public.maintenance_state (key, last_run_at)
values ('daily_cleanup', to_timestamp(0))
on conflict (key) do update set last_run_at = excluded.last_run_at;

select public.run_daily_maintenance() as maintenance_result;
