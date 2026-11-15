-- Settings page: activities move from code (src/lib/activities.ts) into the DB, and every
-- list (activities, people, markers) gets a `hidden` flag (kept on past logs, out of the pickers).
-- Additive only: no existing rows change. np_entry_activities.activity keeps storing the key.

create table public.np_activities (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$' and char_length(key) <= 40),
  label text not null check (char_length(btrim(label)) between 1 and 40 and label = btrim(label)),
  icon text not null default 'activity' check (icon ~ '^[a-z0-9-]{1,40}$'),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index np_activities_user_key_key on public.np_activities (user_id, key);
create unique index np_activities_user_label_key on public.np_activities (user_id, lower(label));

alter table public.np_activities enable row level security;
create policy "Users can read own activity types" on public.np_activities
  for select using ((select auth.uid()) = user_id);
create policy "Users can insert own activity types" on public.np_activities
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own activity types" on public.np_activities
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own activity types" on public.np_activities
  for delete using ((select auth.uid()) = user_id);

-- Seed every existing user with the activities that used to be hard-coded.
insert into public.np_activities (user_id, key, label, icon)
select u.id, v.key, v.label, v.icon
from auth.users u
cross join (values
  (1, 'strength', 'Strength', 'dumbbell'),
  (2, 'run', 'Run', 'footprints'),
  (3, 'swim', 'Swim', 'waves'),
  (4, 'drums', 'Drums', 'drum'),
  (5, 'dance', 'Dance', 'music')
) as v(ord, key, label, icon)
order by u.id, v.ord;

alter table public.np_markers add column hidden boolean not null default false;
alter table public.np_people add column hidden boolean not null default false;
