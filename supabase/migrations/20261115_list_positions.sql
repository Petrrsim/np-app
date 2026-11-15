-- Settings: manual up/down ordering of activities, people and markers.
-- Lists sort by `position` (nulls last), then `id`. Existing rows are numbered in creation
-- order; new rows start null (= end of the list) until the list is next reordered.

alter table public.np_activities add column position integer;
alter table public.np_markers add column position integer;
alter table public.np_people add column position integer;

update public.np_activities t set position = r.rn
from (select id, row_number() over (partition by user_id order by id) - 1 as rn from public.np_activities) r
where r.id = t.id;

update public.np_markers t set position = r.rn
from (select id, row_number() over (partition by user_id order by id) - 1 as rn from public.np_markers) r
where r.id = t.id;

update public.np_people t set position = r.rn
from (select id, row_number() over (partition by user_id order by id) - 1 as rn from public.np_people) r
where r.id = t.id;
