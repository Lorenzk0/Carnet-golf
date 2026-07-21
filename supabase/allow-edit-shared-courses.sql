-- Permet à tout utilisateur authentifié de modifier et supprimer TOUS les parcours,
-- y compris les parcours partagés (owner_id null) — usage privé entre quelques
-- personnes, pas besoin de restreindre l'édition à leur créateur d'origine.
-- Les droits sur les trous (holes) sont hérités du parcours parent, donc relaxés
-- de la même façon.
--
-- Sans risque pour les données existantes : ne change que les policies RLS, ne
-- touche aucune ligne. À exécuter dans Supabase > SQL Editor.
-- Validé sur une base Postgres locale avant envoi : un utilisateur non-propriétaire
-- peut désormais modifier/supprimer un parcours partagé, mais reste toujours
-- incapable de toucher un parcours PRIVÉ appartenant à un autre utilisateur.

drop policy if exists "courses_update_own" on public.courses;
create policy "courses_update_own" on public.courses
  for update to authenticated
  using (owner_id is null or owner_id = auth.uid())
  with check (owner_id is null or owner_id = auth.uid());

drop policy if exists "courses_delete_own" on public.courses;
create policy "courses_delete_own" on public.courses
  for delete to authenticated
  using (owner_id is null or owner_id = auth.uid());

drop policy if exists "holes_insert_own_course" on public.holes;
create policy "holes_insert_own_course" on public.holes
  for insert to authenticated
  with check (
    exists (select 1 from public.courses c where c.id = holes.course_id and (c.owner_id is null or c.owner_id = auth.uid()))
  );

drop policy if exists "holes_update_own_course" on public.holes;
create policy "holes_update_own_course" on public.holes
  for update to authenticated
  using (exists (select 1 from public.courses c where c.id = holes.course_id and (c.owner_id is null or c.owner_id = auth.uid())))
  with check (exists (select 1 from public.courses c where c.id = holes.course_id and (c.owner_id is null or c.owner_id = auth.uid())));

drop policy if exists "holes_delete_own_course" on public.holes;
create policy "holes_delete_own_course" on public.holes
  for delete to authenticated
  using (exists (select 1 from public.courses c where c.id = holes.course_id and (c.owner_id is null or c.owner_id = auth.uid())));
