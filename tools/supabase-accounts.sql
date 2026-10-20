-- ACCOUNTS (csharpuserlive, 2026-10-19). Run once in the SQL editor of the
-- Supabase project, BEFORE turning sign-ups on.
--
-- Eric: "make an account and not have to do onboarding again … if they lose
-- their info i can always send them something to recover access". The
-- database is the source of truth; the phone's localStorage is only a cache
-- (account.js). Each tester reads and writes only their own rows; you see
-- everything in Table Editor.
--
-- After running this, in the dashboard (Authentication → Sign In / Providers):
--   1. turn ON  "Allow new users to sign up";
--   2. under Email, turn OFF "Confirm email" — accounts are USERNAME +
--      PASSWORD (account.js turns "name" into name@users.spindeck.app, an
--      address no mail is ever sent to), so there is nothing to confirm.
--
-- RESETTING A FRIEND'S PASSWORD (they forgot it): run this, with their
-- login ID and the new password. The '~sd' is account.js's PEPPER — it must
-- stay on the end, or the new password won't work.
--   update auth.users
--      set encrypted_password = crypt('newpass' || '~sd', gen_salt('bf'))
--    where email = 'theirloginid@users.spindeck.app';

-- ── 1. SESSION RECORDINGS: ONLY THE VIEWER ACCOUNT ─────────────────────────
-- supabase-login.sql let ANY signed-in account read and delete the bucket,
-- safe only while sign-ups were off. With tester accounts that would hand
-- every tester every recording. Now: only the viewer emails listed here.
-- (Add an address to both lists to give someone else the sessions page.)
drop policy if exists "sessions: signed-in viewers may read" on storage.objects;
create policy "sessions: signed-in viewers may read"
  on storage.objects for select to authenticated
  using (bucket_id = 'sessions' and (auth.jwt() ->> 'email') in ('me@sd.app'));

drop policy if exists "sessions: signed-in viewers may delete" on storage.objects;
create policy "sessions: signed-in viewers may delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sessions' and (auth.jwt() ->> 'email') in ('me@sd.app'));

-- A signed-in tester's recorder still uploads (recorder.js uses the anon key,
-- but be safe if it ever sends a user token).
drop policy if exists "sessions: signed-in may add a recording" on storage.objects;
create policy "sessions: signed-in may add a recording"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sessions');

-- ── 2. PROFILES: one row per account ───────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  username    text,
  onboarded   boolean not null default false,
  onboarding  jsonb not null default '{}'::jsonb,  -- the wizard's answers (service, genres, artists, albums, following)
  profile     jsonb not null default '{}'::jsonb,  -- Edit profile's fields (name, bio, pic, favs …)
  settings    jsonb not null default '{}'::jsonb,  -- spindeck-settings
  taste       jsonb,                               -- spindeck-taste (the connected-service persona)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;
drop policy if exists "profiles: own row" on public.profiles;
create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── 3. REVIEWS: one row per review (the spindeck-logs entries) ─────────────
-- `key` is app.js's logKey: "album::Title::Artist" (or song::/artist::).
create table if not exists public.reviews (
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.reviews enable row level security;
drop policy if exists "reviews: own rows" on public.reviews;
create policy "reviews: own rows" on public.reviews
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4. Is a handle free? (onboarding step 1) ───────────────────────────────
-- Profiles are private, so the app can't look; this answers yes/no only.
create or replace function public.username_taken(name text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where lower(username) = lower(name) and id <> auth.uid());
$$;
grant execute on function public.username_taken(text) to authenticated;

-- ── 5. Does a login ID exist? (the sign-in screen) ─────────────────────────
-- Supabase answers a failed log-in the same way whether the account is
-- missing or the password is wrong; Eric wants the two told apart ("no
-- account under that name" / "wrong password"). Yes/no only.
create or replace function public.login_exists(login text)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where email = lower(login) || '@users.spindeck.app');
$$;
grant execute on function public.login_exists(text) to anon, authenticated;
