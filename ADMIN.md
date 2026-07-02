# Krótka instrukcja administratora

## Dodanie nowej osoby

W Supabase otwórz **SQL Editor** i uruchom:

```sql
select * from public.issue_player_invite();
```

Otrzymasz:

- `player_code` – stały kod gracza, używany po aktywacji;
- `activation_code` – jednorazowy kod do pierwszego wejścia;
- `expires_at` – termin ważności zaproszenia.

Nowej osobie wystarczy przekazać **activation_code**. Po aktywacji strona pokaże jej stały kod gracza.

Kod z innym terminem ważności:

```sql
select * from public.issue_player_invite(interval '7 days');
```

## Zablokowanie użytkownika

```sql
update public.profiles
set is_active = false
where player_code = 'GRACZ-XXXXXXXX';
```

Zablokowana osoba nadal może technicznie utworzyć sesję Auth, ale zasady RLS nie pozwolą jej odczytywać ani zmieniać danych.

## Odblokowanie użytkownika

```sql
update public.profiles
set is_active = true
where player_code = 'GRACZ-XXXXXXXX';
```

## Usunięcie konta

Najbezpieczniej usuwać użytkownika w Supabase: **Authentication → Users**. Profil i jego terminy zostaną usunięte automatycznie przez `ON DELETE CASCADE`.

## Wygaszenie niewykorzystanego zaproszenia

```sql
update public.player_invites
set expires_at = now()
where player_code = 'GRACZ-XXXXXXXX' and consumed_at is null;
```
