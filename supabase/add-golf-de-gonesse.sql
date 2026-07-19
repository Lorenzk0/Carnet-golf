-- Ajoute le Golf de Gonesse (9 trous, par 36) comme parcours partagé.
-- Slope/SSS approximés à partir des valeurs 18 trous (÷2, arrondi) fournies par
-- l'utilisateur — indicatif, comme les autres ratings provisoires de la base.
-- À exécuter dans Supabase > SQL Editor.

insert into public.courses (id, owner_id, nom, nb, ratings) values (
  'gonesse',
  null,
  'Golf de Gonesse',
  9,
  '{"9 trous": {"rouges": {"slope": 61, "sss": 33.4}, "jaunes": {"slope": 64, "sss": 34.6}, "bleus": {"slope": 62, "sss": 33.8}, "blancs": {"slope": 66, "sss": 35.9}}}'::jsonb
)
on conflict (id) do nothing;

insert into public.holes (course_id, numero, par, hcp) values
  ('gonesse', 1, 4, 4),
  ('gonesse', 2, 4, 3),
  ('gonesse', 3, 3, 8),
  ('gonesse', 4, 5, 2),
  ('gonesse', 5, 4, 6),
  ('gonesse', 6, 4, 1),
  ('gonesse', 7, 4, 5),
  ('gonesse', 8, 3, 7),
  ('gonesse', 9, 5, 9)
on conflict (course_id, numero) do nothing;
