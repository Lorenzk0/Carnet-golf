-- Ajoute une fonction de classement filtrée par période (pour comparer sur des périodes
-- variées, comme le filtre du tableau de bord). Additive : la vue `leaderboard` existante
-- n'est pas touchée, l'app l'utilisera pour "Tout" comme avant, et cette fonction pour un
-- filtre précis.
--
-- security definer (comme la vue leaderboard existante en security_invoker=false) :
-- nécessaire pour agréger tous les utilisateurs, seuls les agrégats sont exposés — jamais
-- une partie ou un coup précis d'un autre. search_path fixé à "public" (bonne pratique de
-- sécurité pour une fonction security definer, évite tout détournement via le search_path
-- de l'appelant).
--
-- Validé sur une base Postgres locale avant envoi, avec deux utilisateurs et des parties
-- sur des dates différentes : le filtre restreint bien chaque utilisateur à ses parties
-- de la période choisie, un utilisateur non-propriétaire voit correctement les stats
-- filtrées des AUTRES joueurs (pas seulement les siennes), et l'accès direct aux parties
-- brutes d'autrui reste bloqué.
--
-- À exécuter dans Supabase > SQL Editor.

create or replace function public.leaderboard_filtered(p_from date default null, p_to date default null)
returns table (
  owner_id uuid,
  display_name text,
  rounds_played bigint,
  avg_differential numeric,
  fir_pct numeric,
  gir_pct numeric,
  avg_putts numeric,
  scrambling_pct numeric
)
language sql
security definer
set search_path = public
as $$
  select
    rc.owner_id,
    coalesce(nullif(trim(us.username), ''), 'Joueur ' || substr(rc.owner_id::text, 1, 4)) as display_name,
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
      and (p_from is null or date >= p_from)
      and (p_to is null or date <= p_to)
    group by owner_id
  ) rc
  left join public.user_settings us on us.owner_id = rc.owner_id
  left join (
    select
      lh_inner.owner_id,
      round(
        100.0 * count(*) filter (where lh_inner.par >= 4 and lh_inner.first_zone_end = 'Fairway')
        / nullif(count(*) filter (where lh_inner.par >= 4), 0),
        1
      ) as fir_pct,
      round(
        100.0 * count(*) filter (where lh_inner.shots_count <= lh_inner.par - 2)
        / nullif(count(*), 0),
        1
      ) as gir_pct,
      round(avg(lh_inner.putts_count)::numeric, 2) as avg_putts,
      round(
        100.0 * count(*) filter (
          where lh_inner.shots_count > lh_inner.par - 2
          and (lh_inner.shots_count + lh_inner.penalties_count + lh_inner.putts_count) <= lh_inner.par
        )
        / nullif(count(*) filter (where lh_inner.shots_count > lh_inner.par - 2), 0),
        1
      ) as scrambling_pct
    from public.leaderboard_holes lh_inner
    join public.rounds r2 on r2.id = lh_inner.round_id
    where (p_from is null or r2.date >= p_from)
      and (p_to is null or r2.date <= p_to)
    group by lh_inner.owner_id
  ) lh on lh.owner_id = rc.owner_id;
$$;

revoke all on function public.leaderboard_filtered(date, date) from public, anon;
grant execute on function public.leaderboard_filtered(date, date) to authenticated;
