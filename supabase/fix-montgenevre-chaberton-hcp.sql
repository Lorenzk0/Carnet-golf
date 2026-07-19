-- Corrige les index (HCP) de Montgenèvre Chaberton (id '13') avec la vraie carte de
-- score fournie par l'utilisateur — le par était déjà exact (confirmé : 69 au total,
-- inchangé), seuls les index étaient provisoires (déduits de la longueur faute de
-- carte à jour, voir le commentaire d'origine dans le composant/schema.sql).
-- À exécuter dans Supabase > SQL Editor.
update public.holes set hcp = 15 where course_id = '13' and numero = 1;
update public.holes set hcp = 1  where course_id = '13' and numero = 2;
update public.holes set hcp = 17 where course_id = '13' and numero = 3;
update public.holes set hcp = 3  where course_id = '13' and numero = 4;
update public.holes set hcp = 5  where course_id = '13' and numero = 5;
update public.holes set hcp = 7  where course_id = '13' and numero = 6;
update public.holes set hcp = 13 where course_id = '13' and numero = 7;
update public.holes set hcp = 9  where course_id = '13' and numero = 8;
update public.holes set hcp = 11 where course_id = '13' and numero = 9;
update public.holes set hcp = 6  where course_id = '13' and numero = 10;
update public.holes set hcp = 14 where course_id = '13' and numero = 11;
update public.holes set hcp = 12 where course_id = '13' and numero = 12;
update public.holes set hcp = 16 where course_id = '13' and numero = 13;
update public.holes set hcp = 10 where course_id = '13' and numero = 14;
update public.holes set hcp = 2  where course_id = '13' and numero = 15;
update public.holes set hcp = 4  where course_id = '13' and numero = 16;
update public.holes set hcp = 8  where course_id = '13' and numero = 17;
update public.holes set hcp = 18 where course_id = '13' and numero = 18;
