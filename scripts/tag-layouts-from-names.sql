-- Adds tags to every MV layout from its name: N-WAY, FULL, UMD, AUDIO, AUDIO-n and TC.
-- Safe to run again: existing tags are kept and nothing is duplicated.
with d as (
  select id, array_remove(array[
    (select upper(m[1]) || '-WAY' from regexp_match(upper(name), '(?:^|-)(\d+)-WAY(?:-|$)') m),
    case when upper(name) ~ '(?:^|-)FULL(?:-|$)' then 'FULL' end,
    case when upper(name) ~ '(?:^|-)UMD(?:-|$)' then 'UMD' end,
    case when upper(name) ~ '(?:^|-)AUDIO(?:-|$)' then 'AUDIO' end,
    (select 'AUDIO-' || m[1] from regexp_match(upper(name), '(?:^|-)AUDIO-(\d+)(?:-|$)') m),
    case when upper(name) ~ '(?:^|-)TC(?:-|$)' then 'TC' end
  ], null) as tg from mv_layouts)
update mv_layouts l set tags = array(select distinct u from unnest(l.tags || d.tg) u order by u) from d where d.id = l.id and cardinality(d.tg) > 0;
