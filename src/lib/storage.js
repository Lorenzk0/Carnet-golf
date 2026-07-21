import { supabase } from './supabaseClient.js'
import { cacheGet, cacheSet, cacheDelete, queueAdd, queueAll, queueRemove } from './offlineDb.js'

// Remplace la persistance locale (storeGet/storeSet/storeDelete de GolfTracker.jsx,
// initialement adossée à window.storage) par des appels Supabase, en conservant les
// mêmes signatures et les mêmes clés logiques pour ne pas toucher au reste du composant.
//
// Table `courses` : parcours partagés (owner_id null) + parcours privés (owner_id =
// l'utilisateur). Depuis cette bascule, GolfTracker.jsx n'a plus de parcours en dur
// (COURSES/HOLES_RAW/RATINGS sont vidés) : la clé "custom-courses" — qui ne contenait
// à l'origine que les parcours ajoutés par l'utilisateur — désigne donc maintenant
// TOUS les parcours visibles (partagés + privés), puisque `allCourses` du composant
// vaut `[...COURSES, ...customCourses]` avec COURSES = [].

// Les erreurs Supabase étaient auparavant seulement passées à console.error — invisible
// en pratique sur mobile (pas d'accès simple aux devtools). AuthGate.jsx s'abonne via
// setStorageErrorHandler() pour afficher un bandeau avec le vrai message d'erreur.
let onStorageError = null
export function setStorageErrorHandler(fn) {
  onStorageError = fn
}
function reportError(key, action, e) {
  console.error(`storage error (${action})`, key, e)
  onStorageError?.({ key, action, message: e?.message || String(e) })
}

// AuthGate.jsx s'abonne pour afficher le nombre d'écritures en attente de synchro.
let onQueueChange = null
export function setQueueChangeHandler(fn) {
  onQueueChange = fn
}
async function notifyQueueChange() {
  onQueueChange?.((await queueAll()).length)
}

// Distingue une vraie panne réseau (fetch qui échoue — on doit mettre en attente et
// réessayer plus tard, sans alarmer l'utilisateur) d'une vraie erreur Supabase (policy
// RLS, donnée invalide — à signaler immédiatement, réessayer ne changerait rien).
//
// postgrest-js n'IGNORE JAMAIS une panne fetch en la laissant remonter comme exception —
// il la capture en interne et renvoie un `error` normal avec `code: ''` (chaîne vide,
// jamais absente). Une vraie erreur Postgrest/PostgreSQL a elle toujours un code non
// vide (ex. "42501", "23505", "PGRST116"...). C'est donc `code === ''`, et non un
// `instanceof TypeError` (qui ne matcherait jamais ici, l'exception ayant déjà été
// absorbée avant de nous parvenir), qui signale une panne réseau.
function isNetworkError(e) {
  return !!e && e.code === ''
}

// Mirroir de holeStrokes() dans GolfTracker.jsx : score réel d'un trou = coups +
// pénalités fictives + putts. Dupliqué ici (3 lignes) plutôt que d'exporter depuis
// le composant, pour ne pas toucher à sa structure.
function holeStrokes(hole) {
  const penalties = hole.shots.filter((s) => s.penalite).length
  return hole.shots.length + penalties + (hole.putts?.count || 0)
}

async function getUserSettings() {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
  if (error) throw error
  return (
    data || { custom_clubs: [], hole_overrides: {}, rating_overrides: {}, username: null }
  )
}

async function getLeaderboard() {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('rounds_played', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    ownerId: r.owner_id,
    displayName: r.display_name,
    roundsPlayed: r.rounds_played,
    avgDifferential: r.avg_differential,
    firPct: r.fir_pct,
    girPct: r.gir_pct,
    avgPutts: r.avg_putts,
    scramblingPct: r.scrambling_pct,
  }))
}

async function patchUserSettings(patch) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  if (error) throw error
}

async function getAllCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, nom, nb, ratings, owner_id, holes(numero, par, hcp)')
    .order('numero', { foreignTable: 'holes' })
  if (error) throw error
  return data.map((c) => ({
    id: c.id,
    nom: c.nom,
    nb: c.nb,
    holes: c.holes,
    ratings: c.ratings || null,
  }))
}

// Upsert de TOUT le tableau de parcours (addCustomCourse()/updateCourse() n'en changent
// qu'un à la fois, mais importBackup() peut en fusionner plusieurs d'un coup). `value`
// mélange parcours privés et parcours partagés déjà en base (owner_id null) : les deux
// sont upsertables désormais (policy RLS "update/delete owner_id is null or auth.uid()",
// voir supabase/allow-edit-shared-courses.sql) — plus besoin de filtrer en amont comme
// avant cette policy, où un UPSERT en conflit sur une ligne refusée par RLS aurait fait
// échouer toute la requête. `courses` ne contient de toute façon jamais que des parcours
// visibles pour cet utilisateur (select RLS), donc jamais une ligne qu'il ne pourrait pas
// upserter avec la policy actuelle.
async function syncCourses(courses) {
  if (!courses.length) return

  const { error: courseErr } = await supabase.from('courses').upsert(
    courses.map((c) => ({ id: c.id, nom: c.nom, nb: c.nb, ratings: c.ratings || null }))
  )
  if (courseErr) throw courseErr

  const holeRows = courses.flatMap((c) =>
    (c.holes || []).map((h) => ({ course_id: c.id, numero: h.numero, par: h.par, hcp: h.hcp }))
  )
  if (holeRows.length) {
    const { error: holesErr } = await supabase
      .from('holes')
      .upsert(holeRows, { onConflict: 'course_id,numero' })
    if (holesErr) throw holesErr
  }

  // Purge les trous devenus orphelins si le nombre de trous d'un parcours a été réduit
  // en le modifiant (ex. 18 -> 9) : sans ça, les trous au-delà du nouveau total
  // resteraient en base et referaient surface à la prochaine lecture du parcours.
  for (const c of courses) {
    const { error: pruneErr } = await supabase.from('holes').delete().eq('course_id', c.id).gt('numero', c.nb)
    if (pruneErr) throw pruneErr
  }
}

async function deleteCourse(id) {
  const { error } = await supabase.from('courses').delete().eq('id', id)
  if (error) throw error
}

async function getRound(id) {
  const { data: round, error: roundErr } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (roundErr) throw roundErr
  if (!round) return null

  const { data: shots, error: shotsErr } = await supabase
    .from('shots')
    .select('*')
    .eq('round_id', id)
    .order('idx', { ascending: true })
  if (shotsErr) throw shotsErr

  const shotsByHole = new Map()
  for (const s of shots) {
    const list = shotsByHole.get(s.hole_numero) || []
    list.push({
      zoneStart: s.zone_start,
      sideStart: s.side_start,
      club: s.club,
      contact: s.contact,
      zoneEnd: s.zone_end,
      sideEnd: s.side_end,
      penalite: s.penalite,
      progression: s.progression,
      trajectoire: s.trajectoire,
      isChip: s.is_chip,
      chipDist: s.chip_dist,
    })
    shotsByHole.set(s.hole_numero, list)
  }

  return {
    id: round.id,
    date: round.date,
    courseId: round.course_id,
    courseName: round.course_name,
    ph: round.ph,
    tee: round.tee,
    rating: round.rating,
    totalHolesRef: round.total_holes_ref,
    holes: round.holes.map((h) => ({ ...h, shots: shotsByHole.get(h.numero) || [] })),
  }
}

async function saveRound(round) {
  const holesWithoutShots = round.holes.map(({ shots: _shots, ...h }) => h)
  const score = round.holes.reduce((s, h) => s + holeStrokes(h), 0)
  const complete = round.holes.every((h) => h.putts)

  const { error: roundErr } = await supabase.from('rounds').upsert({
    id: round.id,
    date: round.date,
    course_id: round.courseId,
    course_name: round.courseName,
    ph: round.ph,
    tee: round.tee,
    rating: round.rating,
    total_holes_ref: round.totalHolesRef,
    holes: holesWithoutShots,
    score,
    complete,
    updated_at: new Date().toISOString(),
  })
  if (roundErr) throw roundErr

  const { error: delErr } = await supabase.from('shots').delete().eq('round_id', round.id)
  if (delErr) throw delErr

  const shotRows = round.holes.flatMap((h) =>
    h.shots.map((s, idx) => ({
      round_id: round.id,
      hole_numero: h.numero,
      idx,
      zone_start: s.zoneStart,
      side_start: s.sideStart,
      club: s.club,
      contact: s.contact,
      zone_end: s.zoneEnd,
      side_end: s.sideEnd,
      penalite: s.penalite,
      progression: s.progression,
      trajectoire: s.trajectoire,
      is_chip: !!s.isChip,
      chip_dist: s.chipDist,
    }))
  )
  if (shotRows.length) {
    const { error: insErr } = await supabase.from('shots').insert(shotRows)
    if (insErr) throw insErr
  }
}

async function getRoundsIndex() {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, date, course_name, holes, score, complete')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    date: r.date,
    courseName: r.course_name,
    nbHoles: r.holes.length,
    score: r.score,
    complete: r.complete,
  }))
}

// Dispatch Supabase brut (aucune mise en cache/file ici) : identique à ce que
// storeGet/storeSet faisaient avant l'ajout de la couche offline-first. Réutilisé tel
// quel par flushQueue() pour rejouer une écriture en attente.
async function performGet(key) {
  if (key === 'rounds-index') return await getRoundsIndex()
  if (key === 'custom-clubs') return (await getUserSettings()).custom_clubs
  if (key === 'custom-courses') return await getAllCourses()
  if (key === 'hole-overrides') return (await getUserSettings()).hole_overrides
  if (key === 'rating-overrides') return (await getUserSettings()).rating_overrides
  if (key === 'username') return (await getUserSettings()).username
  if (key === 'leaderboard') return await getLeaderboard()
  if (key.startsWith('round:')) return await getRound(key.slice('round:'.length))
  return null
}

async function performSet(key, value) {
  if (key === 'rounds-index') return // dérivé de `rounds`, rien à persister séparément
  if (key === 'custom-clubs') return await patchUserSettings({ custom_clubs: value })
  if (key === 'custom-courses') return await syncCourses(value)
  if (key === 'hole-overrides') return await patchUserSettings({ hole_overrides: value })
  if (key === 'rating-overrides') return await patchUserSettings({ rating_overrides: value })
  if (key === 'username') return await patchUserSettings({ username: value })
  if (key.startsWith('round:')) return await saveRound(value)
}

async function performDelete(key) {
  if (key.startsWith('round:')) {
    const { error } = await supabase.from('rounds').delete().eq('id', key.slice('round:'.length))
    if (error) throw error
  }
  if (key.startsWith('course:')) return await deleteCourse(key.slice('course:'.length))
}

// Réseau d'abord (comportement inchangé quand il y a du réseau) ; secours sur la
// dernière valeur connue en local uniquement si la requête échoue pour une raison
// réseau (pas pour une vraie erreur Supabase, qui reste signalée normalement).
export async function storeGet(key) {
  try {
    const result = await performGet(key)
    await cacheSet(key, result)
    return result
  } catch (e) {
    if (isNetworkError(e)) {
      // Hors ligne : pas d'erreur affichée, même sans donnée locale disponible — les
      // écrans du composant ont déjà leurs propres messages "aucune partie/parcours
      // pour l'instant" pour ce cas, un bandeau rouge en plus serait trompeur (ça
      // ressemblerait à un bug plutôt qu'à une simple absence de réseau).
      const cached = await cacheGet(key)
      return cached !== undefined ? cached : null
    }
    reportError(key, 'get', e)
    return null
  }
}

// Toujours écrit en local d'abord (aucune perte si l'app se ferme hors ligne), puis
// tente Supabase comme avant. Une panne réseau met l'écriture en file pour retentative
// automatique (flushQueue) au lieu de la perdre silencieusement.
export async function storeSet(key, value) {
  await cacheSet(key, value)
  try {
    await performSet(key, value)
  } catch (e) {
    if (isNetworkError(e)) {
      await queueAdd({ key, value, action: 'set' })
      await notifyQueueChange()
      return
    }
    reportError(key, 'set', e)
  }
}

export async function storeDelete(key) {
  await cacheDelete(key)
  try {
    await performDelete(key)
  } catch (e) {
    if (isNetworkError(e)) {
      await queueAdd({ key, value: null, action: 'delete' })
      await notifyQueueChange()
      return
    }
    reportError(key, 'delete', e)
  }
}

// Rejoue les écritures en attente. À appeler au retour du réseau (événement `online`)
// et à l'ouverture de l'app. Une entrée qui échoue encore pour une raison réseau reste
// en file (nouvelle tentative au prochain appel) ; une vraie erreur est signalée puis
// retirée (la rejouer indéfiniment n'aiderait pas).
export async function flushQueue() {
  const pending = await queueAll()
  for (const op of pending) {
    try {
      if (op.action === 'set') await performSet(op.key, op.value)
      else if (op.action === 'delete') await performDelete(op.key)
      await queueRemove(op.id)
    } catch (e) {
      if (!isNetworkError(e)) {
        reportError(op.key, op.action, e)
        await queueRemove(op.id)
      }
    }
  }
  await notifyQueueChange()
}
