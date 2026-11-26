-- People page: a heart flag on a person = there was some kind of romantic relationship with them.
-- Additive: existing people get false.

alter table public.np_people
  add column romantic boolean not null default false;
