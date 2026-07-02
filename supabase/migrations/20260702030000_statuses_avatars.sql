-- Aktualizacja istniejącego Harmonogramu grania:
-- trzy statusy odpowiedzi i prywatne avatary w Supabase Storage.

alter table public.availability
  add column if not exists status text;

update public.availability
set status = 'available'
where status is null;

alter table public.availability
  alter column status set default 'available',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.availability'::regclass
      and conname = 'availability_status_check'
  ) then
    alter table public.availability
      add constraint availability_status_check
      check (status in ('available', 'unsure', 'unavailable'));
  end if;
end $$;

alter table public.profiles
  add column if not exists avatar_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_path_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_check
      check (
        avatar_path is null
        or (
          char_length(avatar_path) <= 240
          and split_part(avatar_path, '/', 1) = id::text
          and avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9]+[.](jpg|png|webp)$'
        )
      );
  end if;
end $$;

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active players can view avatars" on storage.objects;
drop policy if exists "players can upload their own avatar" on storage.objects;
drop policy if exists "players can update their own avatar" on storage.objects;
drop policy if exists "players can delete their own avatar" on storage.objects;

create policy "active players can view avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and public.is_active_member()
);

create policy "players can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "players can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "players can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);
