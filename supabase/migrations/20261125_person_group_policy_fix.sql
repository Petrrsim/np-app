-- Fix for 20261125_person_group_nesting.sql: its insert/update policies on np_person_groups checked
-- the parent's owner with a subquery on np_person_groups itself, which Postgres rejects as
-- "infinite recursion detected in policy" — so every group insert failed. The policies go back to
-- the plain owner check, and the parent-ownership check moves into the (no-loop) trigger.

alter policy "Users can insert own person groups" on public.np_person_groups
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own person groups" on public.np_person_groups
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.np_person_groups_no_cycle() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur bigint := new.parent_id;
  steps int := 0;
begin
  -- The parent must be one of the same user's groups (runs as the caller, so RLS applies too).
  if new.parent_id is not null and not exists (
    select 1 from public.np_person_groups g where g.id = new.parent_id and g.user_id = new.user_id
  ) then
    raise exception 'Parent group not found' using errcode = '23503';
  end if;
  -- No loops: a group can't end up inside one of its own subgroups.
  while cur is not null loop
    if cur = new.id then
      raise exception 'A group can''t be inside one of its own subgroups' using errcode = '23514';
    end if;
    select g.parent_id into cur from public.np_person_groups g where g.id = cur;
    steps := steps + 1;
    if steps > 50 then
      raise exception 'Groups are nested too deep' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
