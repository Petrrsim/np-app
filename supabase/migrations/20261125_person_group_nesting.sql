-- People page: groups inside groups (any depth), e.g. "Dance Class" and "Work Colleagues" inside
-- "Madeira". A group's people = its own members + everyone in its subgroups (computed in the app).
-- Additive: existing groups stay top-level (parent_id null).

alter table public.np_person_groups
  add column parent_id bigint references public.np_person_groups(id) on delete set null,
  add constraint np_person_groups_parent_not_self check (parent_id <> id);
create index np_person_groups_parent_idx on public.np_person_groups (parent_id);

-- No loops: a group can't end up inside one of its own subgroups.
create function public.np_person_groups_no_cycle() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur bigint := new.parent_id;
  steps int := 0;
begin
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

create trigger np_person_groups_no_cycle
  before insert or update of parent_id on public.np_person_groups
  for each row execute function public.np_person_groups_no_cycle();

-- The parent must be one of the user's own groups.
alter policy "Users can insert own person groups" on public.np_person_groups
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or exists (
      select 1 from public.np_person_groups p where p.id = parent_id and p.user_id = (select auth.uid())
    ))
  );
alter policy "Users can update own person groups" on public.np_person_groups
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or exists (
      select 1 from public.np_person_groups p where p.id = parent_id and p.user_id = (select auth.uid())
    ))
  );
