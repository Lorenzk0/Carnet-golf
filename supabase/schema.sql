-- ============================================================
-- Carnet de golf — schéma Supabase
-- À coller et exécuter dans Project > SQL Editor (Supabase).
-- Idempotent : peut être relancé sans dupliquer les données.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- COURSES : parcours partagés (owner_id null, lecture seule pour
-- tous les utilisateurs authentifiés) + parcours privés par
-- utilisateur (owner_id = auth.uid(), CRUD réservé au propriétaire).
-- `ratings` embarque le slope/CR par configuration et par départ :
-- { "18 trous": { "rouges": {"slope":.., "sss":..}, "jaunes": {...}, ... }, "Aller": {...}, ... }
-- ------------------------------------------------------------
create table if not exists public.courses (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade default auth.uid(),
  nom text not null,
  nb smallint not null check (nb > 0),
  ratings jsonb,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

drop policy if exists "courses_select" on public.courses;
create policy "courses_select" on public.courses
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

drop policy if exists "courses_insert_own" on public.courses;
create policy "courses_insert_own" on public.courses
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "courses_update_own" on public.courses;
create policy "courses_update_own" on public.courses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "courses_delete_own" on public.courses;
create policy "courses_delete_own" on public.courses
  for delete to authenticated
  using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- HOLES : par/hcp de chaque trou d'un parcours (partagé ou privé).
-- Visibilité et droits d'écriture hérités du parcours parent.
-- ------------------------------------------------------------
create table if not exists public.holes (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  numero smallint not null,
  par smallint not null,
  hcp smallint not null,
  unique (course_id, numero)
);

alter table public.holes enable row level security;

drop policy if exists "holes_select" on public.holes;
create policy "holes_select" on public.holes
  for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = holes.course_id
        and (c.owner_id is null or c.owner_id = auth.uid())
    )
  );

drop policy if exists "holes_insert_own_course" on public.holes;
create policy "holes_insert_own_course" on public.holes
  for insert to authenticated
  with check (
    exists (select 1 from public.courses c where c.id = holes.course_id and c.owner_id = auth.uid())
  );

drop policy if exists "holes_update_own_course" on public.holes;
create policy "holes_update_own_course" on public.holes
  for update to authenticated
  using (exists (select 1 from public.courses c where c.id = holes.course_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = holes.course_id and c.owner_id = auth.uid()));

drop policy if exists "holes_delete_own_course" on public.holes;
create policy "holes_delete_own_course" on public.holes
  for delete to authenticated
  using (exists (select 1 from public.courses c where c.id = holes.course_id and c.owner_id = auth.uid()));

-- ------------------------------------------------------------
-- USER_SETTINGS : réglages perso (clubs ajoutés, corrections de
-- par/hcp et de slope/CR) — une ligne par utilisateur, entièrement
-- privée. Remplace les anciennes clés locales "custom-clubs",
-- "hole-overrides" et "rating-overrides".
-- ------------------------------------------------------------
create table if not exists public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  custom_clubs jsonb not null default '[]'::jsonb,
  hole_overrides jsonb not null default '{}'::jsonb,
  rating_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ------------------------------------------------------------
-- ROUNDS : une partie jouée, entièrement privée à son propriétaire.
-- `holes` fige le détail par trou (numero, par, hcp, putts, note)
-- tel que joué — SANS les coups, stockés séparément dans `shots`.
-- Ce sont des instantanés : modifier un parcours plus tard ne change
-- pas les parties déjà enregistrées.
-- ------------------------------------------------------------
create table if not exists public.rounds (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  course_id text references public.courses(id) on delete set null,
  course_name text not null,
  ph smallint not null,
  tee text,
  rating jsonb,
  total_holes_ref smallint not null,
  holes jsonb not null default '[]'::jsonb,
  score smallint,
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rounds enable row level security;

drop policy if exists "rounds_all_own" on public.rounds;
create policy "rounds_all_own" on public.rounds
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ------------------------------------------------------------
-- SHOTS : chaque coup joué sur un trou d'une partie. Visibilité et
-- droits d'écriture hérités de la partie parente (`rounds`).
-- ------------------------------------------------------------
create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds(id) on delete cascade,
  hole_numero smallint not null,
  idx smallint not null,
  zone_start text,
  side_start text,
  club text,
  contact text,
  zone_end text,
  side_end text,
  penalite text,
  progression text,
  trajectoire text,
  is_chip boolean not null default false,
  chip_dist text
);

alter table public.shots enable row level security;

drop policy if exists "shots_select_own" on public.shots;
create policy "shots_select_own" on public.shots
  for select to authenticated
  using (exists (select 1 from public.rounds r where r.id = shots.round_id and r.owner_id = auth.uid()));

drop policy if exists "shots_insert_own" on public.shots;
create policy "shots_insert_own" on public.shots
  for insert to authenticated
  with check (exists (select 1 from public.rounds r where r.id = shots.round_id and r.owner_id = auth.uid()));

drop policy if exists "shots_update_own" on public.shots;
create policy "shots_update_own" on public.shots
  for update to authenticated
  using (exists (select 1 from public.rounds r where r.id = shots.round_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.rounds r where r.id = shots.round_id and r.owner_id = auth.uid()));

drop policy if exists "shots_delete_own" on public.shots;
create policy "shots_delete_own" on public.shots
  for delete to authenticated
  using (exists (select 1 from public.rounds r where r.id = shots.round_id and r.owner_id = auth.uid()));

create index if not exists shots_round_id_idx on public.shots(round_id);
create index if not exists holes_course_id_idx on public.holes(course_id);
create index if not exists rounds_owner_id_idx on public.rounds(owner_id);

-- ============================================================
-- SEED : les parcours partagés d'origine (owner_id null) + leurs
-- trous. Le contenu ci-dessous est généré directement depuis les
-- constantes COURSES / HOLES_RAW / RATINGS du composant d'origine —
-- aucune valeur n'a été retapée à la main.
--
-- Note : le composant listait 14 entrées (les 4 variantes du site
-- "Bois d'O" en comptent 3 en plus du "Pommiers Genêts" 18 trous),
-- pas 12 — elles sont toutes reprises telles quelles ci-dessous.
-- ============================================================

-- Seed: parcours partagés (owner_id = null)
insert into public.courses (id, owner_id, nom, nb, ratings) values
  ('1', null, 'Evreux', 18, $json${"Aller":{"rouges":{"slope":58,"sss":33.3},"jaunes":{"slope":61,"sss":35.1},"bleus":{"slope":60,"sss":34.4},"blancs":{"slope":67,"sss":36.7}},"Retour":{"rouges":{"slope":56,"sss":32.1},"jaunes":{"slope":62,"sss":34.6},"bleus":{"slope":59,"sss":33.2},"blancs":{"slope":68,"sss":36}},"18 trous":{"rouges":{"slope":114,"sss":65.4},"jaunes":{"slope":123,"sss":69.7},"bleus":{"slope":119,"sss":67.6},"blancs":{"slope":135,"sss":72.7}}}$json$::jsonb),
  ('2', null, 'Normandie Côte d''Albâtre', 18, $json${"Aller":{"rouges":{"slope":58,"sss":32.9},"jaunes":{"slope":58,"sss":32.9},"bleus":{"slope":60,"sss":33.8},"blancs":{"slope":66,"sss":36}},"Retour":{"rouges":{"slope":59,"sss":32.8},"jaunes":{"slope":64,"sss":34.9},"bleus":{"slope":61,"sss":33.8},"blancs":{"slope":64,"sss":36.3}},"18 trous":{"rouges":{"slope":117,"sss":65.7},"jaunes":{"slope":126,"sss":69.9},"bleus":{"slope":121,"sss":67.6},"blancs":{"slope":130,"sss":72.3}}}$json$::jsonb),
  ('3', null, 'Tréméreuc', 9, $json${"9 trous":{"rouges":{"slope":61,"sss":32.9},"jaunes":{"slope":67,"sss":34.8},"bleus":{"slope":66,"sss":34.1},"blancs":{"slope":69,"sss":35.6}}}$json$::jsonb),
  ('4', null, 'Manoir de Bévilliers', 9, $json${"9 trous":{"rouges":{"slope":59,"sss":33.2},"jaunes":{"slope":62,"sss":34.6},"bleus":{"slope":60,"sss":33.6},"blancs":{"slope":65,"sss":35.4}}}$json$::jsonb),
  ('5', null, 'Paris Country Club', 9, $json${"9 trous":{"rouges":{"slope":61,"sss":33.4},"jaunes":{"slope":63,"sss":34.7},"bleus":{"slope":61,"sss":33.7},"blancs":{"slope":63,"sss":35.2}}}$json$::jsonb),
  ('6', null, 'Bois d''O Pommiers', 9, $json${"9 trous":{"rouges":{"slope":55,"sss":32.1},"jaunes":{"slope":57,"sss":33.3},"bleus":{"slope":55,"sss":32.1},"blancs":{"slope":59,"sss":34.5}}}$json$::jsonb),
  ('7', null, 'Bois d''O Genêts', 9, $json${"9 trous":{"rouges":{"slope":55,"sss":33.9},"jaunes":{"slope":59,"sss":35.8},"bleus":{"slope":57,"sss":34.6},"blancs":{"slope":63,"sss":36.6}}}$json$::jsonb),
  ('8', null, 'Bois d''O Étang', 9, $json${"9 trous":{"rouges":{"slope":59,"sss":34},"jaunes":{"slope":64,"sss":36.1},"bleus":{"slope":60,"sss":34.5},"blancs":{"slope":62,"sss":37.1}}}$json$::jsonb),
  ('9', null, 'Bois d''O Pommiers Genêts', 18, $json${"18 trous":{"rouges":{"slope":110,"sss":66},"jaunes":{"slope":116,"sss":69.1},"bleus":{"slope":111,"sss":66.7},"blancs":{"slope":122,"sss":71.1}}}$json$::jsonb),
  ('10', null, 'Claux Amic', 18, $json${"Aller":{"rouges":{"slope":59,"sss":31.4},"jaunes":{"slope":66,"sss":34.1},"bleus":{"slope":60,"sss":32.4},"blancs":{"slope":66,"sss":35.7}},"Retour":{"rouges":{"slope":58,"sss":31.8},"jaunes":{"slope":73,"sss":34.5},"bleus":{"slope":62,"sss":32.8},"blancs":{"slope":69,"sss":35.5}},"18 trous":{"rouges":{"slope":117,"sss":63.2},"jaunes":{"slope":139,"sss":68.6},"bleus":{"slope":122,"sss":65.2},"blancs":{"slope":135,"sss":71.2}}}$json$::jsonb),
  ('11', null, 'Etretat', 18, $json${"Aller":{"rouges":{"slope":56,"sss":32.5},"jaunes":{"slope":60,"sss":34.5},"bleus":{"slope":57,"sss":33.4},"blancs":{"slope":63,"sss":35.4}},"Retour":{"rouges":{"slope":57,"sss":32.8},"jaunes":{"slope":62,"sss":35},"bleus":{"slope":60,"sss":33.9},"blancs":{"slope":69,"sss":35.9}},"18 trous":{"rouges":{"slope":113,"sss":65.3},"jaunes":{"slope":122,"sss":69.5},"bleus":{"slope":117,"sss":67.3},"blancs":{"slope":132,"sss":71.3}}}$json$::jsonb),
  ('12', null, 'Center Parcs', 9, $json${"9 trous":{"rouges":{"slope":59,"sss":33.8},"jaunes":{"slope":62,"sss":35.1},"bleus":{"slope":60,"sss":34.1},"blancs":{"slope":64,"sss":36.4}}}$json$::jsonb),
  ('13', null, 'Montgenèvre Chaberton', 18, $json${"Aller":{"rouges":{"slope":57,"sss":31.7},"jaunes":{"slope":60,"sss":33},"bleus":{"slope":57,"sss":31.8},"blancs":{"slope":62,"sss":33.5}},"Retour":{"rouges":{"slope":57,"sss":32.7},"jaunes":{"slope":60,"sss":34},"bleus":{"slope":57,"sss":32.8},"blancs":{"slope":62,"sss":34.5}},"18 trous":{"rouges":{"slope":113,"sss":64.4},"jaunes":{"slope":120,"sss":67},"bleus":{"slope":113,"sss":64.6},"blancs":{"slope":124,"sss":68}}}$json$::jsonb),
  ('14', null, 'Montgenèvre Compact', 9, null)
on conflict (id) do nothing;

-- Seed: trous de chaque parcours partagé
insert into public.holes (course_id, numero, par, hcp) values
  ('1', 1, 4, 6),
  ('1', 2, 5, 11),
  ('1', 3, 4, 12),
  ('1', 4, 4, 4),
  ('1', 5, 3, 16),
  ('1', 6, 5, 13),
  ('1', 7, 3, 15),
  ('1', 8, 4, 5),
  ('1', 9, 4, 1),
  ('1', 10, 4, 17),
  ('1', 11, 4, 18),
  ('1', 12, 5, 9),
  ('1', 13, 3, 7),
  ('1', 14, 4, 3),
  ('1', 15, 5, 14),
  ('1', 16, 3, 8),
  ('1', 17, 4, 10),
  ('1', 18, 4, 2),
  ('2', 1, 5, 12),
  ('2', 2, 4, 13),
  ('2', 3, 4, 1),
  ('2', 4, 4, 16),
  ('2', 5, 3, 4),
  ('2', 6, 5, 7),
  ('2', 7, 4, 5),
  ('2', 8, 3, 8),
  ('2', 9, 4, 14),
  ('2', 10, 4, 18),
  ('2', 11, 4, 15),
  ('2', 12, 4, 10),
  ('2', 13, 3, 6),
  ('2', 14, 4, 2),
  ('2', 15, 5, 9),
  ('2', 16, 3, 11),
  ('2', 17, 4, 17),
  ('2', 18, 5, 3),
  ('3', 1, 3, 7),
  ('3', 2, 4, 8),
  ('3', 3, 3, 5),
  ('3', 4, 5, 4),
  ('3', 5, 5, 2),
  ('3', 6, 4, 6),
  ('3', 7, 4, 1),
  ('3', 8, 3, 9),
  ('3', 9, 4, 3),
  ('4', 1, 4, 4),
  ('4', 2, 5, 5),
  ('4', 3, 4, 6),
  ('4', 4, 4, 2),
  ('4', 5, 3, 9),
  ('4', 6, 5, 7),
  ('4', 7, 3, 8),
  ('4', 8, 4, 3),
  ('4', 9, 4, 1),
  ('5', 1, 4, 5),
  ('5', 2, 3, 2),
  ('5', 3, 4, 6),
  ('5', 4, 4, 3),
  ('5', 5, 5, 1),
  ('5', 6, 3, 7),
  ('5', 7, 4, 8),
  ('5', 8, 4, 9),
  ('5', 9, 4, 4),
  ('6', 1, 4, 2),
  ('6', 2, 4, 5),
  ('6', 3, 5, 6),
  ('6', 4, 3, 7),
  ('6', 5, 4, 8),
  ('6', 6, 3, 3),
  ('6', 7, 5, 1),
  ('6', 8, 4, 4),
  ('6', 9, 4, 9),
  ('7', 1, 4, 7),
  ('7', 2, 3, 8),
  ('7', 3, 4, 1),
  ('7', 4, 5, 4),
  ('7', 5, 4, 3),
  ('7', 6, 4, 6),
  ('7', 7, 3, 5),
  ('7', 8, 5, 9),
  ('7', 9, 4, 2),
  ('8', 1, 5, 5),
  ('8', 2, 3, 3),
  ('8', 3, 5, 4),
  ('8', 4, 3, 7),
  ('8', 5, 4, 9),
  ('8', 6, 4, 1),
  ('8', 7, 4, 8),
  ('8', 8, 5, 6),
  ('8', 9, 4, 2),
  ('9', 1, 4, 2),
  ('9', 2, 4, 5),
  ('9', 3, 5, 6),
  ('9', 4, 3, 7),
  ('9', 5, 4, 8),
  ('9', 6, 3, 3),
  ('9', 7, 5, 1),
  ('9', 8, 4, 4),
  ('9', 9, 4, 9),
  ('9', 10, 4, 7),
  ('9', 11, 3, 8),
  ('9', 12, 4, 1),
  ('9', 13, 5, 4),
  ('9', 14, 4, 3),
  ('9', 15, 4, 6),
  ('9', 16, 3, 5),
  ('9', 17, 5, 9),
  ('9', 18, 4, 2),
  ('10', 1, 4, 2),
  ('10', 2, 3, 14),
  ('10', 3, 4, 8),
  ('10', 4, 3, 6),
  ('10', 5, 5, 10),
  ('10', 6, 4, 4),
  ('10', 7, 4, 16),
  ('10', 8, 4, 18),
  ('10', 9, 5, 12),
  ('10', 10, 4, 2),
  ('10', 11, 3, 14),
  ('10', 12, 4, 8),
  ('10', 13, 3, 6),
  ('10', 14, 5, 10),
  ('10', 15, 4, 4),
  ('10', 16, 4, 16),
  ('10', 17, 4, 18),
  ('10', 18, 5, 12),
  ('11', 1, 4, 8),
  ('11', 2, 3, 16),
  ('11', 3, 4, 2),
  ('11', 4, 4, 10),
  ('11', 5, 4, 6),
  ('11', 6, 5, 12),
  ('11', 7, 4, 13),
  ('11', 8, 4, 4),
  ('11', 9, 3, 18),
  ('11', 10, 5, 1),
  ('11', 11, 3, 11),
  ('11', 12, 5, 7),
  ('11', 13, 3, 14),
  ('11', 14, 4, 3),
  ('11', 15, 3, 17),
  ('11', 16, 4, 9),
  ('11', 17, 4, 15),
  ('11', 18, 5, 5),
  ('12', 1, 4, 4),
  ('12', 2, 5, 2),
  ('12', 3, 3, 6),
  ('12', 4, 5, 3),
  ('12', 5, 4, 9),
  ('12', 6, 5, 8),
  ('12', 7, 4, 7),
  ('12', 8, 3, 5),
  ('12', 9, 4, 1),
  ('13', 1, 4, 5),
  ('13', 2, 4, 9),
  ('13', 3, 5, 1),
  ('13', 4, 4, 7),
  ('13', 5, 4, 11),
  ('13', 6, 4, 13),
  ('13', 7, 3, 17),
  ('13', 8, 4, 15),
  ('13', 9, 5, 3),
  ('13', 10, 3, 10),
  ('13', 11, 3, 12),
  ('13', 12, 4, 8),
  ('13', 13, 3, 14),
  ('13', 14, 3, 16),
  ('13', 15, 3, 18),
  ('13', 16, 4, 4),
  ('13', 17, 4, 6),
  ('13', 18, 5, 2),
  ('14', 1, 3, 3),
  ('14', 2, 3, 4),
  ('14', 3, 3, 5),
  ('14', 4, 3, 6),
  ('14', 5, 3, 7),
  ('14', 6, 3, 8),
  ('14', 7, 3, 9),
  ('14', 8, 4, 1),
  ('14', 9, 4, 2)
on conflict (course_id, numero) do nothing;
