-- Ajoute la persistance de l'index WHS du joueur (proposé à la prochaine partie plutôt
-- que de redemander une valeur par défaut à chaque fois). Additif, sans risque pour les
-- données existantes.
-- À exécuter dans Supabase > SQL Editor.

alter table public.user_settings add column if not exists handicap_index numeric;
