import { supabase } from './supabaseClient.js'

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
    data || { custom_clubs: [], hole_overrides: {}, rating_overrides: {} }
  )
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

// N'insère que le dernier parcours du tableau : addCustomCourse() est le seul appelant
// de storeSet("custom-courses", ...) et ajoute toujours exactement un nouveau parcours
// en fin de tableau — les précédents sont déjà en base.
async function saveNewCustomCourse(course) {
  const { error: courseErr } = await supabase.from('courses').insert({
    id: course.id,
    nom: course.nom,
    nb: course.nb,
    ratings: course.ratings || null,
  })
  if (courseErr) throw courseErr

  if (course.holes?.length) {
    const { error: holesErr } = await supabase.from('holes').insert(
      course.holes.map((h) => ({ course_id: course.id, numero: h.numero, par: h.par, hcp: h.hcp }))
    )
    if (holesErr) throw holesErr
  }
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

export async function storeGet(key) {
  try {
    if (key === 'rounds-index') return await getRoundsIndex()
    if (key === 'custom-clubs') return (await getUserSettings()).custom_clubs
    if (key === 'custom-courses') return await getAllCourses()
    if (key === 'hole-overrides') return (await getUserSettings()).hole_overrides
    if (key === 'rating-overrides') return (await getUserSettings()).rating_overrides
    if (key.startsWith('round:')) return await getRound(key.slice('round:'.length))
    return null
  } catch (e) {
    console.error('storage error (get)', key, e)
    return null
  }
}

export async function storeSet(key, value) {
  try {
    if (key === 'rounds-index') return // dérivé de `rounds`, rien à persister séparément
    if (key === 'custom-clubs') return await patchUserSettings({ custom_clubs: value })
    if (key === 'custom-courses') return await saveNewCustomCourse(value[value.length - 1])
    if (key === 'hole-overrides') return await patchUserSettings({ hole_overrides: value })
    if (key === 'rating-overrides') return await patchUserSettings({ rating_overrides: value })
    if (key.startsWith('round:')) return await saveRound(value)
  } catch (e) {
    console.error('storage error (set)', key, e)
  }
}

export async function storeDelete(key) {
  try {
    if (key.startsWith('round:')) {
      const { error } = await supabase.from('rounds').delete().eq('id', key.slice('round:'.length))
      if (error) throw error
    }
  } catch (e) {
    console.error('storage error (delete)', key, e)
  }
}
