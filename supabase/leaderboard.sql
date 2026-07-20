-- Classement entre utilisateurs : pseudo + stats agrégées (parties jouées, différentiel
-- moyen, fairways/greens en régulation, putting moyen, scrambling). N'expose jamais le
-- détail trou par trou ou coup par coup des autres — uniquement ces agrégats, calculés
-- côté base. À exécuter dans Supabase > SQL Editor.

-- ------------------------------------------------------------
-- Pseudo : réutilise user_settings (une ligne par utilisateur, déjà en place pour les
-- clubs/corrections). Pas d'unicité imposée — un simple pseudo libre.
-- ------------------------------------------------------------
alter table public.user_settings add column if not exists username text;

-- ------------------------------------------------------------
-- Vue interne (non exposée à l'API) : un trou joué = une ligne, avec le nombre de coups
-- et la zone d'arrivée du premier coup, dénormalisés depuis rounds.holes (jsonb) et
-- shots. Sert uniquement de brique pour la vue `leaderboard` ci-dessous.
-- ------------------------------------------------------------
create or replace view public.leaderboard_holes
with (security_invoker = true)
as
select
  r.owner_id,
  r.id as round_id,
  (h ->> 'numero')::int as numero,
  (h ->> 'par')::int as par,
  (h -> 'putts' ->> 'count')::int as putts_count,
  coalesce(s.shots_count, 0) as shots_count,
  coalesce(s.penalties_count, 0) as penalties_count,
  s.first_zone_end
from public.rounds r
cross join lateral jsonb_array_elements(r.holes) as h
left join lateral (
  select
    count(*) as shots_count,
    count(*) filter (where sh.penalite is not null) as penalties_count,
    (array_agg(sh.zone_end order by sh.idx))[1] as first_zone_end
  from public.shots sh
  where sh.round_id = r.id and sh.hole_numero = (h ->> 'numero')::int
) s on true
where jsonb_typeof(h -> 'putts') = 'object';

-- Vue interne : jamais accessible directement via l'API (voir revoke plus bas) —
-- security_invoker=true fait qu'elle respecte le RLS de `rounds`/`shots` si jamais
-- quelqu'un y accédait quand même, par sécurité supplémentaire.
revoke all on public.leaderboard_holes from public, anon, authenticated;

-- ------------------------------------------------------------
-- Vue publique du classement : une ligne par utilisateur ayant terminé au moins une
-- partie. security_invoker=false (comportement par défaut des vues Postgres) : elle
-- s'exécute avec les droits de son propriétaire, qui n'est pas soumis au RLS sur ses
-- propres tables — c'est voulu, c'est ce qui permet d'agréger tout le monde. En
-- contrepartie, elle n'expose QUE des agrégats (jamais une partie ou un coup précis),
-- et l'accès à `leaderboard_holes`/`rounds`/`shots` d'autrui reste bloqué par ailleurs.
create or replace view public.leaderboard
with (security_invoker = false)
as
select
  rc.owner_id,
  coalesce(nullif(trim(us.username), ''), split_part(u.email, '@', 1)) as display_name,
  rc.rounds_played,
  rc.avg_differential,
  lh.fir_pct,
  lh.gir_pct,
  lh.avg_putts,
  lh.scrambling_pct
from (
  select
    owner_id,
    count(*) as rounds_played,
    round(
      avg(((score - (rating ->> 'sss')::numeric) * 113 / (rating ->> 'slope')::numeric))::numeric,
      1
    ) as avg_differential
  from public.rounds
  where complete = true
  group by owner_id
) rc
join auth.users u on u.id = rc.owner_id
left join public.user_settings us on us.owner_id = rc.owner_id
left join (
  select
    owner_id,
    -- Fairways en régulation : 1er coup sur le fairway, trous par 4 et plus seulement
    -- (pas de fairway attendu sur un par 3).
    round(
      100.0 * count(*) filter (where par >= 4 and first_zone_end = 'Fairway')
      / nullif(count(*) filter (where par >= 4), 0),
      1
    ) as fir_pct,
    -- Greens en régulation : green atteint en par-2 coups ou moins.
    round(
      100.0 * count(*) filter (where shots_count <= par - 2)
      / nullif(count(*), 0),
      1
    ) as gir_pct,
    round(avg(putts_count)::numeric, 2) as avg_putts,
    -- Scrambling : green manqué (pas en régulation) mais score du trou <= par quand même.
    round(
      100.0 * count(*) filter (
        where shots_count > par - 2
        and (shots_count + penalties_count + putts_count) <= par
      )
      / nullif(count(*) filter (where shots_count > par - 2), 0),
      1
    ) as scrambling_pct
  from public.leaderboard_holes
  group by owner_id
) lh on lh.owner_id = rc.owner_id;

revoke all on public.leaderboard from public, anon;
grant select on public.leaderboard to authenticated;
