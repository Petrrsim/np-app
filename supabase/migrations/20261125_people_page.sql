-- People page: a living note on each person, named + coloured groups of people, and named
-- connections between two people (positive / neutral / negative). Additive only.

-- A free-text note per person ("general information"), edited over time on the People page.
alter table public.np_people
  add column note text not null default '' check (char_length(note) <= 20000),
  add column note_updated_at timestamptz;

-- Groups ("Family", "Work", …). `color` is a key of GROUP_COLORS in src/lib/people.ts.
create table public.np_person_groups (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  color text not null default 'indigo' check (color ~ '^[a-z]{1,20}$'),
  position integer,
  created_at timestamptz not null default now()
);
create unique index np_person_groups_user_name_key on public.np_person_groups (user_id, lower(name));

alter table public.np_person_groups enable row level security;
create policy "Users can read own person groups" on public.np_person_groups
  for select using ((select auth.uid()) = user_id);
create policy "Users can insert own person groups" on public.np_person_groups
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own person groups" on public.np_person_groups
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own person groups" on public.np_person_groups
  for delete using ((select auth.uid()) = user_id);

-- Who is in which group (a person can be in any number of groups).
create table public.np_person_group_members (
  group_id bigint not null references public.np_person_groups(id) on delete cascade,
  person_id bigint not null references public.np_people(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, person_id)
);
create index np_person_group_members_person_idx on public.np_person_group_members (person_id);
create index np_person_group_members_user_idx on public.np_person_group_members (user_id);

alter table public.np_person_group_members enable row level security;
create policy "Users can read own group members" on public.np_person_group_members
  for select using ((select auth.uid()) = user_id);
create policy "Users can insert own group members" on public.np_person_group_members
  for insert with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.np_person_groups g where g.id = group_id and g.user_id = (select auth.uid()))
    and exists (select 1 from public.np_people p where p.id = person_id and p.user_id = (select auth.uid()))
  );
create policy "Users can delete own group members" on public.np_person_group_members
  for delete using ((select auth.uid()) = user_id);

-- Connections between two people. Undirected: stored once per pair with person_a < person_b.
-- tone: -1 negative · 0 neutral · 1 positive. label: optional short description.
create table public.np_person_links (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_a bigint not null references public.np_people(id) on delete cascade,
  person_b bigint not null references public.np_people(id) on delete cascade,
  tone smallint not null default 0 check (tone between -1 and 1),
  label text not null default '' check (char_length(label) <= 80 and label = btrim(label)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_a < person_b),
  unique (person_a, person_b)
);
create index np_person_links_person_b_idx on public.np_person_links (person_b);
create index np_person_links_user_idx on public.np_person_links (user_id);

alter table public.np_person_links enable row level security;
create policy "Users can read own person links" on public.np_person_links
  for select using ((select auth.uid()) = user_id);
create policy "Users can insert own person links" on public.np_person_links
  for insert with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.np_people p where p.id = person_a and p.user_id = (select auth.uid()))
    and exists (select 1 from public.np_people p where p.id = person_b and p.user_id = (select auth.uid()))
  );
create policy "Users can update own person links" on public.np_person_links
  for update using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.np_people p where p.id = person_a and p.user_id = (select auth.uid()))
    and exists (select 1 from public.np_people p where p.id = person_b and p.user_id = (select auth.uid()))
  );
create policy "Users can delete own person links" on public.np_person_links
  for delete using ((select auth.uid()) = user_id);
