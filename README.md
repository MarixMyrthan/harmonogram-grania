# Harmonogram grania

Prywatny, wspólny kalendarz dla grupy graczy. Każdy widzi terminy całej ekipy, ale może zmieniać wyłącznie własne zaznaczenia i własną nazwę.

## Funkcje MVP

- miesięczny kalendarz działający na komputerze i telefonie;
- zaznaczenie dnia „pasuje mi”;
- opcjonalna uwaga tekstowa, np. `od 19:00`;
- podgląd osób dostępnych danego dnia;
- wyróżnienie dni pasujących wszystkim;
- pierwsze wejście przez jednorazowy kod aktywacyjny;
- własny 6-cyfrowy PIN i stały kod gracza;
- zmiana nazwy i PIN-u przez użytkownika;
- aktualizacje na żywo przez Supabase Realtime;
- Row Level Security: odczyt całej grupy, zapis tylko własnych rekordów;
- automatyczne wdrożenie na GitHub Pages.

## Architektura

- React + TypeScript + Vite – interfejs;
- Supabase Auth – PIN przechowywany jak hasło, bez jawnego zapisu w tabelach;
- Supabase PostgreSQL + RLS – profile i terminy;
- Supabase Edge Function – bezpieczna aktywacja konta;
- GitHub Pages – hosting statycznej aplikacji.

## 1. Uruchomienie Supabase

1. Utwórz projekt w Supabase.
2. W **SQL Editor** wklej i uruchom plik:
   `supabase/migrations/20260702000000_initial.sql`.
3. W ustawieniach Auth wyłącz publiczne samodzielne rejestrowanie nowych kont. Konta tworzy tylko funkcja aktywacyjna.
4. Włącz logowanie e-mail/hasło. Wewnętrzny adres e-mail jest tworzony automatycznie na podstawie kodu gracza i nie jest pokazywany użytkownikowi.

## 2. Wdrożenie funkcji aktywacyjnej

Zainstaluj Supabase CLI i połącz repozytorium z projektem:

```bash
supabase login
supabase link --project-ref TWOJ_PROJECT_REF
supabase functions deploy activate-player --no-verify-jwt
```

Funkcja używa sekretnego klucza Supabase dostępnego wyłącznie po stronie Edge Function. Nigdy nie dodawaj secret/service-role key do pliku `.env` frontendu ani do GitHuba.

## 3. Konfiguracja lokalna

```bash
cp .env.example .env
npm install
npm run dev
```

Uzupełnij `.env`:

```env
VITE_SUPABASE_URL=https://TWOJ_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TWOJ_KLUCZ
```

Klucz publishable może znajdować się w aplikacji przeglądarkowej, ponieważ właściwe uprawnienia wymusza RLS. Sekretny klucz nie może trafić do przeglądarki.

## 4. Utworzenie pierwszych zaproszeń

W Supabase SQL Editor uruchom osobno dla każdej osoby:

```sql
select * from public.issue_player_invite();
```

Przekaż osobie wartość `activation_code`. Przy pierwszym wejściu poda nazwę i ustawi własny PIN. Po aktywacji otrzyma stały `player_code`.

Dalsze operacje administratora opisuje plik [ADMIN.md](ADMIN.md).

## 5. Wdrożenie na GitHub Pages

1. Utwórz repozytorium i wypchnij projekt na gałąź `main`.
2. W GitHubie przejdź do **Settings → Secrets and variables → Actions → Variables**.
3. Dodaj zmienne:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Przejdź do **Settings → Pages** i jako źródło wybierz **GitHub Actions**.
5. Workflow `.github/workflows/deploy.yml` zbuduje i opublikuje stronę automatycznie.

Konfiguracja Vite sama wykrywa nazwę repozytorium i ustawia prawidłową ścieżkę bazową dla adresu `https://uzytkownik.github.io/nazwa-repozytorium/`.

## Test przed publikacją

```bash
npm ci
npm run typecheck
npm run build
```

Sprawdź w dwóch oddzielnych przeglądarkach lub profilach:

1. aktywację dwóch kont;
2. widoczność terminów obu osób;
3. próbę edycji własnego wpisu;
4. brak możliwości modyfikowania wpisu drugiej osoby;
5. zmianę nazwy i PIN-u;
6. odświeżanie kalendarza na żywo.

## Ważne uwagi bezpieczeństwa

- PIN ma dokładnie 6 cyfr. Kod gracza jest dodatkową, losową częścią danych logowania.
- Nie umieszczaj secret/service-role key w repozytorium ani w zmiennych `VITE_*`.
- RLS jest obowiązkowy; nie wyłączaj go na tabelach `profiles` i `availability`.
- Dla większej, publicznej aplikacji warto dołożyć CAPTCHA i ostrzejsze ograniczenia prób logowania. Ten projekt jest przeznaczony dla niewielkiej, prywatnej grupy.
