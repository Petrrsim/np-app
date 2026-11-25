-- People page: your own energy with each person ("vibe"), separate from connections between two
-- other people. -1 draining · 0 neutral · 1 energizing; null = not set. Plus a short description,
-- e.g. "really good vibe together". Additive: existing people get null / ''.

alter table public.np_people
  add column vibe smallint check (vibe between -1 and 1),
  add column vibe_note text not null default '' check (char_length(vibe_note) <= 120 and vibe_note = btrim(vibe_note));
