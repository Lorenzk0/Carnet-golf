-- Corrige les index (HCP) de Montgenèvre Compact (id '14') avec la vraie carte de
-- score fournie par l'utilisateur — le par était déjà exact (29 au total, inchangé),
-- seuls les index étaient provisoires. Toujours pas de slope/CR : parcours compact
-- non classé, aucun différentiel ne sera calculé pour cette raison (comportement
-- volontaire, pas un oubli).
-- À exécuter dans Supabase > SQL Editor.
update public.holes set hcp = 7 where course_id = '14' and numero = 1;
update public.holes set hcp = 3 where course_id = '14' and numero = 2;
update public.holes set hcp = 6 where course_id = '14' and numero = 3;
update public.holes set hcp = 2 where course_id = '14' and numero = 4;
update public.holes set hcp = 8 where course_id = '14' and numero = 5;
update public.holes set hcp = 1 where course_id = '14' and numero = 6;
update public.holes set hcp = 4 where course_id = '14' and numero = 7;
update public.holes set hcp = 5 where course_id = '14' and numero = 8;
update public.holes set hcp = 9 where course_id = '14' and numero = 9;
