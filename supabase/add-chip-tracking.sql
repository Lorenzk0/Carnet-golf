-- Ajoute le suivi du "petit jeu" (chipping) : deux champs par coup, is_chip et
-- chip_dist. Additif, sans risque pour les données existantes — les coups déjà
-- enregistrés prennent is_chip = false, chip_dist = null.
-- À exécuter dans Supabase > SQL Editor.

alter table public.shots add column if not exists is_chip boolean not null default false;
alter table public.shots add column if not exists chip_dist text;
