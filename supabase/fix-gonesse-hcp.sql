-- Corrige l'index de difficulté (HCP) des trous 3 et 8 du Golf de Gonesse, inversés par
-- rapport à la carte officielle FFGolf/Kady (trou 3 = hcp 7, trou 8 = hcp 8 — et non
-- l'inverse comme actuellement en base). Le par et les autres trous sont corrects.
-- Sans risque pour les parties déjà enregistrées : `holes` y est un instantané indépendant
-- de la table `courses.holes`, donc ça ne change que les NOUVELLES parties et les
-- statistiques recalculées à partir de ce parcours.
-- À exécuter dans Supabase > SQL Editor.

update public.holes set hcp = 7 where course_id = 'gonesse' and numero = 3;
update public.holes set hcp = 8 where course_id = 'gonesse' and numero = 8;
