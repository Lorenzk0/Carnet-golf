import React, { useState, useEffect, useCallback } from "react";
import { Flag, ChevronRight, ChevronLeft, Plus, Trash2, Copy, Check, Home, X, BarChart3 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { storeGet, storeSet, storeDelete } from "./lib/storage.js";

// Les parcours (partagés + privés par utilisateur) vivent désormais dans Supabase
// (table `courses`, voir supabase/schema.sql) plutôt qu'en dur ici. `customCourses`
// — chargé via storeGet("custom-courses"), voir lib/storage.js — contient donc
// maintenant TOUS les parcours visibles, pas seulement ceux ajoutés par l'utilisateur ;
// coursHoles()/baseRating() plus bas retombent déjà sur customCourses quand ces
// constantes sont vides, donc aucune autre ligne n'a besoin de changer.
const COURSES = [];
const HOLES_RAW = {};

// Change ce numéro à chaque mise à jour livrée — affiché sur l'accueil pour vérifier
// en un coup d'œil qu'une republication a bien pris effet.
const APP_VERSION = "v34 · consultation/modification des slope & CR";

const CLUBS = ["D", "4h", "5i", "6i", "7i", "8i", "9i", "Pw", "Gw", "Sw", "Putter", "?"];
const ZONES = ["Fairway", "Rough", "Bunker", "Avant-green", "Green", "Hors-limite", "Eau"];
const SIDES = ["Gauche", "Droite", "Trop court", "Trop long"];
// Pénalité éventuelle sur un coup : ajoute 1 coup fictif au score sans correspondre à un swing réel.
const PENALTIES = [
  { v: "OB / Perdue", zones: ["Hors-limite"] },
  { v: "Eau", zones: ["Eau"] },
  { v: "Injouable", zones: [] },
];
// Résultat tactique du coup, indépendant de la qualité de contact :
// un contact "correct" peut ne faire avancer la balle que de peu si le lie était mauvais.
const PROGRESS = ["Avancé nettement", "Avancé un peu", "Sans gain", "Recul"];
const TRAJECTORY = ["Droit", "Fade", "Draw", "Slice", "Hook"];
// worst -> best. `c` = pastille de saisie, `bar` = couleur pleine pour les barres empilées.
const CONTACTS = [
  { v: "Topé", c: "bg-red-100 border-red-300 text-red-800", bar: "bg-red-500" },
  { v: "Gratté", c: "bg-red-100 border-red-300 text-red-800", bar: "bg-red-400" },
  { v: "Socket", c: "bg-orange-100 border-orange-300 text-orange-800", bar: "bg-orange-500" },
  { v: "Pointe", c: "bg-orange-100 border-orange-300 text-orange-800", bar: "bg-orange-400" },
  { v: "Moyen", c: "bg-yellow-100 border-yellow-300 text-yellow-800", bar: "bg-yellow-400" },
  { v: "Correct", c: "bg-amber-100 border-amber-300 text-amber-800", bar: "bg-amber-400" },
  { v: "Bon", c: "bg-lime-100 border-lime-400 text-lime-800", bar: "bg-lime-500" },
  { v: "Pur", c: "bg-emerald-100 border-emerald-400 text-emerald-800", bar: "bg-emerald-600" },
];
const PUTT_DIST = ["<2m", "2-5m", "5-10m", "10-20m", ">20m"];

// Catégories de score par trou, du meilleur au pire. "Quad+" regroupe +4 et au-delà :
// sans ce panier, ces trous seraient comptés comme des triples et fausseraient le graphique.
const SCORE_CATS = [
  { key: "eagle", label: "Eagle ou mieux", color: "#065f46", test: (e) => e <= -2 },
  { key: "birdie", label: "Birdie", color: "#10b981", test: (e) => e === -1 },
  { key: "par", label: "Par", color: "#84cc16", test: (e) => e === 0 },
  { key: "bogey", label: "Bogey", color: "#facc15", test: (e) => e === 1 },
  { key: "double", label: "Double", color: "#fb923c", test: (e) => e === 2 },
  { key: "triple", label: "Triple", color: "#ef4444", test: (e) => e === 3 },
  { key: "quad", label: "Quad+", color: "#7f1d1d", test: (e) => e >= 4 },
];

// Nombre de putts par trou, du meilleur au pire. "4+" évite de tronquer les trous très coûteux.
const PUTT_CATS = [
  { key: "p1", label: "1 putt", color: "#059669", test: (n) => n === 1 },
  { key: "p2", label: "2 putts", color: "#84cc16", test: (n) => n === 2 },
  { key: "p3", label: "3 putts", color: "#fb923c", test: (n) => n === 3 },
  { key: "p4", label: "4 putts et +", color: "#b91c1c", test: (n) => n >= 4 },
];

// Zones de réception, de la meilleure à la pire, avec couleur de barre et note (pour le tri).
const LANDING_ZONES = [
  { z: "Green", bar: "bg-emerald-600", score: 1 },
  { z: "Fairway", bar: "bg-lime-500", score: 0.85 },
  { z: "Avant-green", bar: "bg-lime-300", score: 0.7 },
  { z: "Rough", bar: "bg-amber-400", score: 0.4 },
  { z: "Bunker", bar: "bg-orange-400", score: 0.3 },
  { z: "Eau", bar: "bg-blue-400", score: 0 },
  { z: "Hors-limite", bar: "bg-red-600", score: 0 },
];

// ---------- Embedded rating.csv : slope + SSS (course rating) par parcours/config/départ ----------
const TEES = ["Rouges", "Jaunes", "Bleus", "Blancs"];
// Slope/CR des parcours partagés : chargés depuis Supabase (courses.ratings), voir
// le commentaire au-dessus de COURSES. baseRating() plus bas retombe déjà sur
// customCourses quand RATINGS est vide.
const RATINGS = [];
// Configuration jouée, déduite du parcours et de ce qu'on joue.
function resolveConfig(courseNb, nbToPlay, firstNumero) {
  if (courseNb === 9) return "9 trous";
  if (nbToPlay === 18) return "18 trous";
  return firstNumero <= 9 ? "Aller" : "Retour";
}

// Slope/CR d'origine : parcours intégré (RATINGS) ou parcours ajouté par l'utilisateur.
function baseRating(courseId, config, customCourses = []) {
  const row = RATINGS.find((r) => r.idParcours === courseId && r.config === config);
  if (row) return { rouges: row.rouges, jaunes: row.jaunes, bleus: row.bleus, blancs: row.blancs };
  const custom = customCourses.find((c) => c.id === courseId);
  if (custom && custom.ratings && custom.ratings[config]) return custom.ratings[config];
  return null;
}

// Slope/CR effectif = valeurs d'origine, écrasées départ par départ par les corrections
// éventuelles de l'utilisateur (les ratings sont révisés périodiquement par la fédération).
function findRating(courseId, courseNb, nbToPlay, firstNumero, customCourses = [], ratingOverrides = {}) {
  const config = resolveConfig(courseNb, nbToPlay, firstNumero);
  const base = baseRating(courseId, config, customCourses);
  const ov = ratingOverrides[`${courseId}_${config}`];
  if (!base && !ov) return null;
  return { ...(base || {}), ...(ov || {}) };
}

function coursHoles(courseId, customCourses = [], holeOverrides = {}) {
  let base;
  if (HOLES_RAW[courseId]) {
    base = HOLES_RAW[courseId].map(([n, par, hcp]) => ({ numero: n, par, hcp }));
  } else {
    const custom = customCourses.find((c) => c.id === courseId);
    base = custom ? custom.holes.map((h) => ({ ...h })) : [];
  }
  return base.map((h) => {
    const ov = holeOverrides[`${courseId}_${h.numero}`];
    return ov ? { ...h, ...ov } : h;
  });
}
function rotate(arr, startNum) {
  const idx = arr.findIndex((h) => h.numero === startNum);
  if (idx <= 0) return arr;
  return [...arr.slice(idx), ...arr.slice(0, idx)];
}
function strokesRecu(holeHcp, ph, total) {
  const base = Math.floor(ph / total);
  const rest = ph % total;
  return base + (holeHcp <= rest ? 1 : 0);
}
function stableford(strokesNet, par) {
  return Math.max(0, 2 - (strokesNet - par));
}
// Score réel du trou = coups swingués + coups fictifs de pénalité + putts.
function holeStrokes(hole) {
  const penalties = hole.shots.filter((s) => s.penalite).length;
  return hole.shots.length + penalties + (hole.putts?.count || 0);
}
// Après un coup, où repart le suivant : à l'endroit d'arrivée normalement,
// mais si une pénalité s'applique (OB, eau, injouable) on rejoue depuis
// l'endroit où CE coup a été joué (coup et distance / drop proche du point de départ).
function nextShotOrigin(shot) {
  if (shot.penalite) return { zoneStart: shot.zoneStart, sideStart: shot.sideStart };
  return { zoneStart: shot.zoneEnd, sideStart: shot.zoneEnd === "Rough" ? shot.sideEnd : null };
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Code court d'un parcours, dérivé du nom : initiales des mots significatifs
// ("Bois d'O Pommiers Genêts" -> "BPG"), ou 3 premières lettres si un seul mot ("Evreux" -> "EVR").
const COURSE_STOPWORDS = ["de", "du", "des", "la", "le", "les", "d", "l", "en", "et"];
function courseCode(name) {
  if (!name) return "";
  const words = name
    .split(/[\s'’-]+/)
    .map((w) => w.trim())
    .filter((w) => w && !COURSE_STOPWORDS.includes(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
}

// Parse minimal d'un texte CSV (gère les champs entre guillemets, virgules et guillemets échappés).
function parseCSVText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

// Configurations possibles d'un parcours ajouté : un 9 trous n'en a qu'une,
// un 18 trous se joue en aller, en retour ou en entier — chacune a son slope/CR.
const CONFIGS_9 = ["9 trous"];
const CONFIGS_18 = ["18 trous", "Aller", "Retour"];

// Grille slope/CR vide : une entrée par configuration, chacune avec une ligne par départ.
function emptyRatings() {
  const o = {};
  [...CONFIGS_9, ...CONFIGS_18].forEach((cfg) => {
    o[cfg] = {};
    TEES.forEach((t) => {
      o[cfg][t.toLowerCase()] = { slope: "", sss: "" };
    });
  });
  return o;
}

function Pill({ active, onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-full border text-sm font-medium transition active:scale-95 ${
        active
          ? "bg-emerald-800 border-emerald-800 text-white"
          : "bg-white border-stone-300 text-stone-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function GolfTracker() {
  const [screen, setScreen] = useState("home"); // home | setup | play | summary | settings
  const [settingsTab, setSettingsTab] = useState("clubs");
  const [roundsIndex, setRoundsIndex] = useState([]);
  const [round, setRound] = useState(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [draft, setDraft] = useState({ zoneStart: "Départ", sideStart: null, club: null, contact: null, zoneEnd: null, sideEnd: null, penalite: null, progression: null, trajectoire: null });
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customClubs, setCustomClubs] = useState([]);
  const [customCourses, setCustomCourses] = useState([]);
  const [holeOverrides, setHoleOverrides] = useState({});
  const [ratingOverrides, setRatingOverrides] = useState({});

  useEffect(() => {
    (async () => {
      const idx = (await storeGet("rounds-index")) || [];
      const cc = (await storeGet("custom-clubs")) || [];
      const co = (await storeGet("custom-courses")) || [];
      const ho = (await storeGet("hole-overrides")) || {};
      const ro = (await storeGet("rating-overrides")) || {};
      setRoundsIndex(idx);
      setCustomClubs(cc);
      setCustomCourses(co);
      setHoleOverrides(ho);
      setRatingOverrides(ro);
      setLoaded(true);
    })();
  }, []);

  const allCourses = [...COURSES, ...customCourses];
  const allClubs = [...CLUBS.slice(0, -1), ...customClubs, "?"];

  async function addCustomClub(name) {
    if (!name || customClubs.includes(name) || CLUBS.includes(name)) return;
    const next = [...customClubs, name];
    setCustomClubs(next);
    await storeSet("custom-clubs", next);
  }

  async function addCustomCourse(course) {
    const next = [...customCourses, course];
    setCustomCourses(next);
    await storeSet("custom-courses", next);
  }

  async function saveHoleOverride(courseId, numero, par, hcp) {
    const next = { ...holeOverrides, [`${courseId}_${numero}`]: { par, hcp } };
    setHoleOverrides(next);
    await storeSet("hole-overrides", next);
  }

  // Corrige le slope/CR d'un parcours pour une configuration donnée. `tees` ne contient que
  // les départs renseignés : les autres gardent la valeur d'origine.
  async function saveRatingOverride(courseId, config, tees) {
    const key = `${courseId}_${config}`;
    const next = { ...ratingOverrides };
    if (tees && Object.keys(tees).length) next[key] = tees;
    else delete next[key];
    setRatingOverrides(next);
    await storeSet("rating-overrides", next);
  }

  async function resetRatingOverride(courseId, config) {
    const next = { ...ratingOverrides };
    delete next[`${courseId}_${config}`];
    setRatingOverrides(next);
    await storeSet("rating-overrides", next);
  }

  const saveRound = useCallback(async (r) => {
    await storeSet(`round:${r.id}`, r);
    setRoundsIndex((prev) => {
      const without = prev.filter((x) => x.id !== r.id);
      const entry = {
        id: r.id,
        date: r.date,
        courseName: r.courseName,
        nbHoles: r.holes.length,
        score: r.holes.reduce((s, h) => s + holeStrokes(h), 0),
        complete: r.holes.every((h) => h.putts),
      };
      const next = [entry, ...without];
      storeSet("rounds-index", next);
      return next;
    });
  }, []);

  function startSetup() {
    setScreen("setup");
  }

  function beginRound({ courseId, courseName, nbToPlay, startHole, ph, date, tee }) {
    let holes = coursHoles(courseId, customCourses, holeOverrides);
    if (courseId) holes = rotate(holes, startHole).slice(0, nbToPlay);
    else {
      holes = Array.from({ length: nbToPlay }, (_, i) => ({ numero: i + 1, par: 4, hcp: i + 1 }));
    }
    const courseNb = courseId ? (allCourses.find((c) => c.id === courseId)?.nb || nbToPlay) : nbToPlay;
    const ratingRow = courseId ? findRating(courseId, courseNb, nbToPlay, holes[0]?.numero, customCourses, ratingOverrides) : null;
    const teeKey = tee ? tee.toLowerCase() : "bleus";
    const teeRating = ratingRow && ratingRow[teeKey] && ratingRow[teeKey].slope && ratingRow[teeKey].sss ? ratingRow[teeKey] : null;
    const r = {
      id: uid(),
      date,
      courseId: courseId || null,
      courseName,
      ph,
      tee: tee || null,
      rating: teeRating ? { slope: teeRating.slope, sss: teeRating.sss } : null,
      totalHolesRef: courseNb,
      holes: holes.map((h) => ({ ...h, shots: [], putts: null, note: "" })),
    };
    setRound(r);
    setHoleIdx(0);
    setDraft({ zoneStart: "Départ", sideStart: null, club: null, contact: null, zoneEnd: null, sideEnd: null, penalite: null, progression: null, trajectoire: null });
    setScreen("play");
  }

  function currentHole() {
    return round?.holes[holeIdx];
  }

  function addShot() {
    if (!draft.club || !draft.contact || !draft.zoneEnd) return;
    const hole = currentHole();
    const shot = { ...draft };
    const newHoles = round.holes.map((h, i) =>
      i === holeIdx ? { ...h, shots: [...h.shots, shot] } : h
    );
    const newRound = { ...round, holes: newHoles };
    setRound(newRound);
    saveRound(newRound);
    const origin = nextShotOrigin(shot);
    setDraft({
      zoneStart: origin.zoneStart,
      sideStart: origin.sideStart,
      club: null,
      contact: null,
      zoneEnd: null,
      sideEnd: null,
      penalite: null,
      progression: null,
      trajectoire: null,
    });
  }

  function removeLastShot() {
    const hole = currentHole();
    if (!hole.shots.length) return;
    const newShots = hole.shots.slice(0, -1);
    const origin = newShots.length ? nextShotOrigin(newShots[newShots.length - 1]) : { zoneStart: "Départ", sideStart: null };
    const newHoles = round.holes.map((h, i) => (i === holeIdx ? { ...h, shots: newShots } : h));
    const newRound = { ...round, holes: newHoles };
    setRound(newRound);
    saveRound(newRound);
    setDraft({ zoneStart: origin.zoneStart, sideStart: origin.sideStart, club: null, contact: null, zoneEnd: null, sideEnd: null, penalite: null, progression: null, trajectoire: null });
  }

  function setPutts(count, dist) {
    const newHoles = round.holes.map((h, i) => (i === holeIdx ? { ...h, putts: { count, firstPuttDist: dist } } : h));
    const newRound = { ...round, holes: newHoles };
    setRound(newRound);
    saveRound(newRound);
  }

  function resetPutts() {
    const newHoles = round.holes.map((h, i) => (i === holeIdx ? { ...h, putts: null } : h));
    const newRound = { ...round, holes: newHoles };
    setRound(newRound);
    saveRound(newRound);
  }

  function updateRoundDate(newDate) {
    const newRound = { ...round, date: newDate };
    setRound(newRound);
    saveRound(newRound);
  }

  // Reconstruit le brouillon (zone de départ du prochain coup) pour un trou donné,
  // qu'il soit vide ou déjà partiellement/entièrement saisi.
  function draftFor(hole) {
    if (!hole.shots.length) return { zoneStart: "Départ", sideStart: null };
    return nextShotOrigin(hole.shots[hole.shots.length - 1]);
  }
  function emptyDraft(origin) {
    return { zoneStart: origin.zoneStart, sideStart: origin.sideStart, club: null, contact: null, zoneEnd: null, sideEnd: null, penalite: null, progression: null, trajectoire: null };
  }

  function goToHole(idx) {
    setHoleIdx(idx);
    setDraft(emptyDraft(draftFor(round.holes[idx])));
    setScreen("play");
  }

  function updateNoteLocal(text) {
    setRound((r) => ({ ...r, holes: r.holes.map((h, i) => (i === holeIdx ? { ...h, note: text } : h)) }));
  }
  function commitNote() {
    setRound((r) => {
      saveRound(r);
      return r;
    });
  }

  function nextHole() {
    if (holeIdx < round.holes.length - 1) {
      setHoleIdx(holeIdx + 1);
      setDraft(emptyDraft(draftFor(round.holes[holeIdx + 1])));
    } else {
      setScreen("summary");
    }
  }
  function prevHole() {
    if (holeIdx > 0) {
      setHoleIdx(holeIdx - 1);
      setDraft(emptyDraft(draftFor(round.holes[holeIdx - 1])));
    }
  }

  async function openPastRound(id) {
    const r = await storeGet(`round:${id}`);
    if (r) {
      setRound(r);
      const firstIncomplete = r.holes.findIndex((h) => !h.putts);
      if (firstIncomplete === -1) {
        setHoleIdx(0);
        setScreen("summary");
      } else {
        setHoleIdx(firstIncomplete);
        setDraft(emptyDraft(draftFor(r.holes[firstIncomplete])));
        setScreen("play");
      }
    }
  }

  async function deleteRound(id) {
    await storeDelete(`round:${id}`);
    const next = roundsIndex.filter((r) => r.id !== id);
    setRoundsIndex(next);
    storeSet("rounds-index", next);
  }

  // Sauvegarde complète : parties + réglages (clubs ajoutés, parcours créés, trous modifiés).
  // Sans les réglages, une dépublication ferait perdre les parcours et clubs personnalisés.
  async function exportAllRoundsJSON() {
    const all = [];
    for (const entry of roundsIndex) {
      const r = await storeGet(`round:${entry.id}`);
      if (r) all.push(r);
    }
    return JSON.stringify({ format: "carnet-de-coups", version: 3, rounds: all, customClubs, customCourses, holeOverrides, ratingOverrides });
  }

  // Récupère toutes les parties complètes depuis le stockage, pour le tableau de bord.
  async function fetchAllRounds() {
    const all = [];
    for (const entry of roundsIndex) {
      const r = await storeGet(`round:${entry.id}`);
      if (r) all.push(r);
    }
    return all;
  }

  async function exportAllRoundsCSV() {
    const all = [];
    for (const entry of roundsIndex) {
      const r = await storeGet(`round:${entry.id}`);
      if (r) all.push(r);
    }
    return all.map((r) => `== ${r.date} · ${r.courseName} ==\n${buildCSV(r)}`).join("\n\n");
  }

  // Restaure une sauvegarde JSON. Accepte le format v2 (objet avec parties + réglages) et
  // l'ancien format (simple tableau de parties). Écrase les parties de même id, garde les autres.
  async function importBackup(jsonText) {
    const parsed = JSON.parse(jsonText);
    const isLegacyArray = Array.isArray(parsed);
    const roundsIn = isLegacyArray ? parsed : parsed && Array.isArray(parsed.rounds) ? parsed.rounds : null;
    if (!roundsIn) throw new Error("Le texte collé n'est pas une sauvegarde valide.");

    for (const r of roundsIn) {
      if (!r || !r.id || !Array.isArray(r.holes)) continue;
      await storeSet(`round:${r.id}`, r);
    }
    const importedEntries = roundsIn
      .filter((r) => r && r.id && Array.isArray(r.holes))
      .map((r) => ({
        id: r.id,
        date: r.date,
        courseName: r.courseName,
        nbHoles: r.holes.length,
        score: r.holes.reduce((s, h) => s + holeStrokes(h), 0),
        complete: r.holes.every((h) => h.putts),
      }));
    const importedIds = new Set(importedEntries.map((e) => e.id));
    const merged = [...importedEntries, ...roundsIndex.filter((e) => !importedIds.has(e.id))];
    setRoundsIndex(merged);
    await storeSet("rounds-index", merged);

    // Réglages (format v2 uniquement) : fusion avec l'existant plutôt qu'écrasement.
    let settingsRestored = false;
    if (!isLegacyArray) {
      if (Array.isArray(parsed.customClubs)) {
        const mergedClubs = [...new Set([...customClubs, ...parsed.customClubs])];
        setCustomClubs(mergedClubs);
        await storeSet("custom-clubs", mergedClubs);
        settingsRestored = true;
      }
      if (Array.isArray(parsed.customCourses)) {
        const existingIds = new Set(customCourses.map((c) => c.id));
        const mergedCourses = [...customCourses, ...parsed.customCourses.filter((c) => c && !existingIds.has(c.id))];
        setCustomCourses(mergedCourses);
        await storeSet("custom-courses", mergedCourses);
        settingsRestored = true;
      }
      if (parsed.holeOverrides && typeof parsed.holeOverrides === "object") {
        const mergedOverrides = { ...holeOverrides, ...parsed.holeOverrides };
        setHoleOverrides(mergedOverrides);
        await storeSet("hole-overrides", mergedOverrides);
        settingsRestored = true;
      }
      if (parsed.ratingOverrides && typeof parsed.ratingOverrides === "object") {
        const mergedRatings = { ...ratingOverrides, ...parsed.ratingOverrides };
        setRatingOverrides(mergedRatings);
        await storeSet("rating-overrides", mergedRatings);
        settingsRestored = true;
      }
    }
    return { rounds: importedEntries.length, settingsRestored, legacy: isLegacyArray };
  }

  // Reconstruit des parties à partir d'un export CSV (celui du bouton "Copier le tableau").
  // Best-effort : le CSV ne stocke pas le handicap de jeu exact ni la zone d'arrivée du dernier
  // coup avant pénalité, donc ph est mis à 44 par défaut et certaines zoneEnd sont déduites.
  // Regroupe les lignes par Date+Parcours (une partie = un couple date/parcours).
  async function importCSVBackup(csvText) {
    const rows = parseCSVText(csvText.trim());
    if (rows.length < 2) throw new Error("CSV vide ou incomplet.");
    const header = rows[0];
    const idx = {};
    header.forEach((h, i) => {
      idx[h] = i;
    });
    if (idx["Date"] === undefined || idx["Trou"] === undefined) {
      throw new Error("En-têtes CSV non reconnues — colle l'export tel quel, avec la ligne d'en-tête.");
    }
    let maxShots = 0;
    while (idx[`Coup${maxShots + 1}_club`] !== undefined) maxShots++;

    const groups = new Map();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[idx["Date"]]) continue;
      const key = `${row[idx["Date"]]}|${row[idx["Parcours"]]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const rebuilt = [];
    for (const groupRows of groups.values()) {
      const first = groupRows[0];
      const slope = idx["Slope"] !== undefined && first[idx["Slope"]] ? Number(first[idx["Slope"]]) : null;
      const sss = idx["CR"] !== undefined && first[idx["CR"]] ? Number(first[idx["CR"]]) : null;
      const tee = idx["Depart"] !== undefined ? first[idx["Depart"]] || null : null;
      const ph = idx["Handicap_jeu"] !== undefined && first[idx["Handicap_jeu"]] !== "" ? Number(first[idx["Handicap_jeu"]]) : 44;
      const totalHolesRefCSV = idx["Trous_ref_parcours"] !== undefined && first[idx["Trous_ref_parcours"]] !== "" ? Number(first[idx["Trous_ref_parcours"]]) : null;

      const holes = groupRows
        .map((row) => {
          const numero = Number(row[idx["Trou"]]);
          const par = Number(row[idx["Par"]]);
          const hcp = Number(row[idx["HCP"]]);
          const shots = [];
          for (let i = 1; i <= maxShots; i++) {
            const club = row[idx[`Coup${i}_club`]];
            if (!club) continue;
            const situationRaw = row[idx[`Coup${i}_situation`]] || "";
            const m = situationRaw.match(/^(.*?)(?:\s\((\w+)\))?$/);
            shots.push({
              zoneStart: m ? m[1].trim() : situationRaw,
              sideStart: m && m[2] ? m[2] : null,
              club,
              contact: row[idx[`Coup${i}_qualite`]] || null,
              zoneEnd: null,
              sideEnd: null,
              penalite: (idx[`Coup${i}_penalite`] !== undefined && row[idx[`Coup${i}_penalite`]]) || null,
              progression: (idx[`Coup${i}_progression`] !== undefined && row[idx[`Coup${i}_progression`]]) || null,
              trajectoire: (idx[`Coup${i}_trajectoire`] !== undefined && row[idx[`Coup${i}_trajectoire`]]) || null,
            });
          }
          const puttsRaw = idx["Putts"] !== undefined ? row[idx["Putts"]] : "";
          const putts = puttsRaw ? { count: Number(puttsRaw), firstPuttDist: (idx["Putt1_distance"] !== undefined && row[idx["Putt1_distance"]]) || null } : null;
          const note = idx["Note"] !== undefined ? row[idx["Note"]] || "" : "";
          for (let k = 0; k < shots.length; k++) {
            if (shots[k].penalite) {
              shots[k].zoneEnd = shots[k].penalite === "Eau" ? "Eau" : shots[k].penalite === "Injouable" ? shots[k].zoneStart : "Hors-limite";
            } else if (k < shots.length - 1) {
              shots[k].zoneEnd = shots[k + 1].zoneStart;
              shots[k].sideEnd = shots[k + 1].sideStart;
            } else {
              shots[k].zoneEnd = putts ? "Green" : shots[k].zoneStart;
            }
          }
          return { numero, par, hcp, shots, putts, note };
        })
        .sort((a, b) => a.numero - b.numero);

      rebuilt.push({
        id: uid(),
        date: first[idx["Date"]],
        courseId: null,
        courseName: first[idx["Parcours"]],
        ph,
        tee,
        rating: slope && sss ? { slope, sss } : null,
        totalHolesRef: totalHolesRefCSV || holes.length,
        holes,
      });
    }

    for (const r of rebuilt) {
      await storeSet(`round:${r.id}`, r);
    }
    const newEntries = rebuilt.map((r) => ({
      id: r.id,
      date: r.date,
      courseName: r.courseName,
      nbHoles: r.holes.length,
      score: r.holes.reduce((s, h) => s + holeStrokes(h), 0),
      complete: r.holes.every((h) => h.putts),
    }));
    const merged2 = [...newEntries, ...roundsIndex];
    setRoundsIndex(merged2);
    await storeSet("rounds-index", merged2);
    return rebuilt.length;
  }

  function csvSafe(v) {
    const s = String(v ?? "").replace(/\n/g, " ").trim();
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildCSV(r) {
    const maxShots = Math.max(1, ...r.holes.map((h) => h.shots.length));
    const totalStrokesAll = r.holes.reduce((s, h) => s + holeStrokes(h), 0);
    const differential = r.rating ? Math.round(((totalStrokesAll - r.rating.sss) * 113) / r.rating.slope * 10) / 10 : "";
    const cols = ["Date", "Parcours", "Trou", "Par", "HCP", "Score_brut", "Score_net", "Écart_par", "Points_Stableford", "Handicap_jeu", "Trous_ref_parcours", "Depart", "Slope", "CR", "Differentiel_indicatif"];
    for (let i = 1; i <= maxShots; i++) {
      cols.push(`Coup${i}_club`, `Coup${i}_situation`, `Coup${i}_qualite`, `Coup${i}_penalite`, `Coup${i}_progression`, `Coup${i}_trajectoire`);
    }
    cols.push("Putts", "Putt1_distance", "Fairway_touché", "GIR", "Note");
    const rows = [cols.join(",")];
    r.holes.forEach((h) => {
      const strokes = holeStrokes(h);
      const ecart = strokes - h.par;
      const net = strokes - strokesRecu(h.hcp, r.ph, r.totalHolesRef);
      const pts = stableford(net, h.par);
      const fir = h.par >= 4 ? (h.shots[0]?.zoneEnd === "Fairway" ? "Oui" : "Non") : "";
      const gir = h.putts ? (h.shots.length <= h.par - 2 ? "Oui" : "Non") : "";
      const row = [r.date, r.courseName, h.numero, h.par, h.hcp, strokes, net, ecart, pts, r.ph, r.totalHolesRef, r.tee || "", r.rating?.slope ?? "", r.rating?.sss ?? "", differential];
      for (let i = 0; i < maxShots; i++) {
        const s = h.shots[i];
        row.push(s ? s.club : "", s ? s.zoneStart + (s.sideStart ? ` (${s.sideStart})` : "") : "", s ? s.contact : "", s?.penalite || "", s?.progression || "", s?.trajectoire || "");
      }
      row.push(h.putts?.count ?? "", h.putts?.firstPuttDist ?? "", fir, gir, csvSafe(h.note));
      rows.push(row.join(","));
    });
    return rows.join("\n");
  }

  function copyCSV() {
    const csv = buildCSV(round);
    navigator.clipboard?.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500">Chargement…</div>;
  }

  // ---------------- HOME ----------------
  if (screen === "home") {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900">
        <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-200 text-xs uppercase tracking-widest mb-1">
              <Flag size={14} /> Suivi de partie
            </div>
            <h1 className="text-2xl font-bold">Carnet de coups</h1>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={() => setScreen("dashboard")} className="text-emerald-200 text-xs underline">Tableau de bord</button>
            <button onClick={() => { setSettingsTab("backup"); setScreen("settings"); }} className="text-emerald-200 text-xs underline">Sauvegarde</button>
            <button onClick={() => { setSettingsTab("clubs"); setScreen("settings"); }} className="text-emerald-200 text-xs underline">Parcours &amp; clubs</button>
          </div>
        </div>
        <div className="p-5">
          <button
            onClick={startSetup}
            className="w-full bg-amber-600 text-white rounded-2xl py-4 font-semibold text-lg flex items-center justify-center gap-2 active:scale-95 transition mb-6"
          >
            <Plus size={20} /> Nouvelle partie
          </button>

          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">Parties enregistrées</h2>
          {roundsIndex.length === 0 && (
            <p className="text-stone-400 text-sm">Aucune partie pour l'instant.</p>
          )}
          <div className="space-y-2">
            {roundsIndex.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-3 flex items-center justify-between">
                <button className="text-left flex-1" onClick={() => openPastRound(r.id)}>
                  <div className="font-medium flex items-center gap-2">
                    {r.courseName}
                    {r.complete === false && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">en cours</span>}
                  </div>
                  <div className="text-xs text-stone-500">{r.date} · {r.nbHoles} trous · score {r.score}</div>
                </button>
                <button onClick={() => deleteRound(r.id)} className="p-2 text-stone-400 active:text-red-500">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-stone-300 text-xs mt-8">{APP_VERSION}</p>
        </div>
      </div>
    );
  }

  // ---------------- SETUP ----------------
  if (screen === "setup") {
    return <SetupScreen onBack={() => setScreen("home")} onStart={beginRound} customCourses={customCourses} />;
  }

  // ---------------- DASHBOARD ----------------
  if (screen === "dashboard") {
    return <DashboardScreen onBack={() => setScreen("home")} fetchAllRounds={fetchAllRounds} roundCount={roundsIndex.length} />;
  }

  // ---------------- SETTINGS ----------------
  if (screen === "settings") {
    return (
      <SettingsScreen
        onBack={() => setScreen("home")}
        clubs={CLUBS.slice(0, -1)}
        customClubs={customClubs}
        onAddClub={addCustomClub}
        courses={allCourses}
        onAddCourse={addCustomCourse}
        onSaveOverride={saveHoleOverride}
        ratingOverrides={ratingOverrides}
        onSaveRating={saveRatingOverride}
        onResetRating={resetRatingOverride}
        customCourses={customCourses}
        coursHoles={(courseId) => coursHoles(courseId, customCourses, holeOverrides)}
        holeOverrides={holeOverrides}
        onExportAllJSON={exportAllRoundsJSON}
        onExportAllCSV={exportAllRoundsCSV}
        onImportBackup={importBackup}
        onImportCSV={importCSVBackup}
        roundCount={roundsIndex.length}
        initialTab={settingsTab}
      />
    );
  }

  // ---------------- PLAY ----------------
  if (screen === "play" && round) {
    const hole = currentHole();
    const strokes = holeStrokes(hole);
    const onGreen = hole.shots.length > 0 && hole.shots[hole.shots.length - 1].zoneEnd === "Green" && !hole.shots[hole.shots.length - 1].penalite;
    const needsPutts = onGreen && !hole.putts;

    return (
      <div className="min-h-screen bg-stone-50 pb-8">
        <div className="bg-emerald-900 text-white px-5 pt-6 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => setScreen("home")} className="text-emerald-200"><Home size={20} /></button>
            <div className="text-center">
              <div className="text-xs text-emerald-200 uppercase tracking-widest">Trou</div>
              <div className="text-2xl font-bold leading-none">{hole.numero}</div>
            </div>
            <div className="text-right text-xs text-emerald-200">
              Par {hole.par} · Hcp {hole.hcp}
            </div>
          </div>
          <div className="flex justify-center gap-1 mt-2">
            {round.holes.map((h, i) => (
              <button
                key={i}
                onClick={() => goToHole(i)}
                aria-label={`Aller au trou ${h.numero}`}
                className={`h-1.5 rounded-full ${i === holeIdx ? "w-6 bg-amber-600" : i < holeIdx ? "w-1.5 bg-emerald-400" : "w-1.5 bg-emerald-900"}`}
              />
            ))}
          </div>
        </div>

        <div className="px-5 pt-4">
          {/* Committed shots */}
          {hole.shots.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {hole.shots.map((s, i) => (
                <div key={i} className="bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs">
                  <span className="font-semibold">{s.club}</span> · {s.zoneStart}{s.sideStart ? ` (${s.sideStart})` : ""} → {s.zoneEnd}{s.sideEnd ? ` (${s.sideEnd})` : ""} · {s.contact}
                  {s.progression && <span className="ml-1 text-stone-400">· {s.progression}</span>}
                  {s.trajectoire && <span className="ml-1 text-stone-400">· {s.trajectoire}</span>}
                  {s.penalite && <span className="ml-1 text-red-600 font-semibold">⚠ {s.penalite} (+1)</span>}
                </div>
              ))}
              <button onClick={removeLastShot} className="text-xs text-red-500 underline px-2">annuler dernier</button>
            </div>
          )}

          {!needsPutts && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Zone de départ du coup</div>
                <div className="flex flex-wrap gap-2">
                  {["Départ", ...ZONES.filter((z) => z !== "Green")].map((z) => (
                    <Pill key={z} active={draft.zoneStart === z} onClick={() => setDraft({ ...draft, zoneStart: z, sideStart: z === "Rough" ? draft.sideStart : null })}>{z}</Pill>
                  ))}
                </div>
                {draft.zoneStart === "Rough" && (
                  <div className="flex gap-2 mt-2">
                    {SIDES.map((s) => (
                      <Pill key={s} active={draft.sideStart === s} onClick={() => setDraft({ ...draft, sideStart: s })}>{s}</Pill>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Club</div>
                <div className="flex flex-wrap gap-2">
                  {allClubs.map((c) => (
                    <Pill key={c} active={draft.club === c} onClick={() => setDraft({ ...draft, club: c })}>{c}</Pill>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Qualité du contact</div>
                <div className="flex flex-wrap gap-2">
                  {CONTACTS.map(({ v, c }) => (
                    <button
                      key={v}
                      onClick={() => setDraft({ ...draft, contact: v })}
                      className={`px-3 py-2 rounded-full border text-sm font-medium active:scale-95 transition ${draft.contact === v ? c + " ring-2 ring-offset-1 ring-emerald-700" : c}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Trajectoire</div>
                <div className="flex flex-wrap gap-2">
                  {TRAJECTORY.map((t) => (
                    <Pill key={t} active={draft.trajectoire === t} onClick={() => setDraft({ ...draft, trajectoire: t })}>{t}</Pill>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Zone d'arrivée</div>
                <div className="flex flex-wrap gap-2">
                  {ZONES.map((z) => (
                    <Pill
                      key={z}
                      active={draft.zoneEnd === z}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          zoneEnd: z,
                          sideEnd: z === "Rough" ? draft.sideEnd : null,
                          penalite: z === "Hors-limite" ? "OB / Perdue" : z === "Eau" ? "Eau" : null,
                        })
                      }
                    >
                      {z}
                    </Pill>
                  ))}
                </div>
                {draft.zoneEnd === "Rough" && (
                  <div className="flex gap-2 mt-2">
                    {SIDES.map((s) => (
                      <Pill key={s} active={draft.sideEnd === s} onClick={() => setDraft({ ...draft, sideEnd: s })}>{s}</Pill>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Pénalité sur ce coup</div>
                <div className="flex flex-wrap gap-2">
                  <Pill active={!draft.penalite} onClick={() => setDraft({ ...draft, penalite: null })}>Aucune</Pill>
                  {PENALTIES.map((p) => (
                    <Pill key={p.v} active={draft.penalite === p.v} onClick={() => setDraft({ ...draft, penalite: p.v })}>{p.v}</Pill>
                  ))}
                </div>
                {draft.penalite && (
                  <p className="text-xs text-stone-400 mt-1">+1 coup fictif ajouté au score. Le coup suivant repart de "{draft.zoneStart}"{draft.sideStart ? ` (${draft.sideStart})` : ""} — modifiable si besoin.</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Résultat tactique (progression)</div>
                <div className="flex flex-wrap gap-2">
                  {PROGRESS.map((p) => (
                    <Pill key={p} active={draft.progression === p} onClick={() => setDraft({ ...draft, progression: p })}>{p}</Pill>
                  ))}
                </div>
              </div>

              <button
                onClick={addShot}
                disabled={!draft.club || !draft.contact || !draft.zoneEnd}
                className="w-full bg-emerald-900 disabled:bg-stone-300 text-white rounded-xl py-3 font-semibold active:scale-95 transition"
              >
                Valider le coup
              </button>
            </div>
          )}

          {needsPutts && (
            <PuttsCard onSave={(count, dist) => setPutts(count, dist)} />
          )}

          {hole.putts && (
            <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-stone-500">Score du trou</div>
                <div className="text-3xl font-bold">{strokes} <span className="text-base font-normal text-stone-400">({strokes - hole.par >= 0 ? "+" : ""}{strokes - hole.par})</span></div>
                <div className="text-xs text-stone-400">{hole.putts.count} putt{hole.putts.count > 1 ? "s" : ""}{hole.putts.firstPuttDist ? ` · 1er putt ${hole.putts.firstPuttDist}` : ""}</div>
                <button onClick={resetPutts} className="text-xs text-stone-400 underline mt-1">modifier les putts</button>
              </div>
              <button onClick={nextHole} className="bg-amber-600 text-white rounded-xl px-5 py-3 font-semibold flex items-center gap-1 active:scale-95">
                {holeIdx < round.holes.length - 1 ? "Trou suivant" : "Terminer"} <ChevronRight size={18} />
              </button>
            </div>
          )}

          <div className="mt-4">
            <NoteField key={holeIdx} initial={hole.note} onChange={updateNoteLocal} onCommit={commitNote} />
          </div>

          <div className="flex justify-between mt-4">
            <button onClick={prevHole} disabled={holeIdx === 0} className="text-stone-400 disabled:opacity-30 flex items-center gap-1 text-sm">
              <ChevronLeft size={16} /> Trou précédent
            </button>
            <button onClick={() => setScreen("summary")} className="text-stone-500 text-sm underline">Voir le récap</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- SUMMARY ----------------
  if (screen === "summary" && round) {
    const totalStrokes = round.holes.reduce((s, h) => s + holeStrokes(h), 0);
    const totalPar = round.holes.reduce((s, h) => s + h.par, 0);
    const totalStrokesRecus = round.holes.reduce((s, h) => s + strokesRecu(h.hcp, round.ph, round.totalHolesRef), 0);
    const totalNet = totalStrokes - totalStrokesRecus;
    const totalPts = round.holes.reduce((s, h) => {
      const strokes = holeStrokes(h);
      const net = strokes - strokesRecu(h.hcp, round.ph, round.totalHolesRef);
      return s + stableford(net, h.par);
    }, 0);
    const par4plus = round.holes.filter((h) => h.par >= 4);
    const firHit = par4plus.filter((h) => h.shots[0]?.zoneEnd === "Fairway").length;
    const girHit = round.holes.filter((h) => h.putts && h.shots.length <= h.par - 2).length;
    const scrambles = round.holes.filter((h) => h.putts && h.shots.length > h.par - 2 && holeStrokes(h) <= h.par);
    const differential = round.rating ? Math.round(((totalStrokes - round.rating.sss) * 113) / round.rating.slope * 10) / 10 : null;

    // Par type de trou (3/4/5)
    const byParType = [3, 4, 5].map((par) => {
      const holes = round.holes.filter((h) => h.par === par && h.putts);
      const strokes = holes.reduce((s, h) => s + holeStrokes(h), 0);
      return { par, count: holes.length, strokes, avg: holes.length ? strokes / holes.length : null };
    }).filter((p) => p.count > 0);

    // Répartition des qualités de contact sur la partie
    const allShots = round.holes.flatMap((h) => h.shots);
    const contactCounts = CONTACTS.map(({ v }) => ({ v, count: allShots.filter((s) => s.contact === v).length })).filter((c) => c.count > 0);

    // Pénalités par type
    const penaltyCounts = PENALTIES.map((p) => ({ v: p.v, count: allShots.filter((s) => s.penalite === p.v).length })).filter((p) => p.count > 0);
    const totalPenalties = penaltyCounts.reduce((s, p) => s + p.count, 0);

    // Détail putting
    const holesWithPutts = round.holes.filter((h) => h.putts);
    const totalPutts = holesWithPutts.reduce((s, h) => s + h.putts.count, 0);
    const avgPutts = holesWithPutts.length ? (totalPutts / holesWithPutts.length) : null;
    const onePutts = holesWithPutts.filter((h) => h.putts.count === 1).length;
    const threePutts = holesWithPutts.filter((h) => h.putts.count >= 3).length;
    const puttsByDist = PUTT_DIST.map((d) => {
      const holes = holesWithPutts.filter((h) => h.putts.firstPuttDist === d);
      const oneOff = holes.filter((h) => h.putts.count === 1).length;
      return { d, count: holes.length, oneOff };
    }).filter((p) => p.count > 0);

    // Qualité de contact par club, classé du meilleur contact moyen au moins bon
    const clubsUsed = [...new Set(allShots.map((s) => s.club).filter(Boolean))];
    const contactByClub = clubsUsed
      .map((club) => {
        const shots = allShots.filter((s) => s.club === club);
        const counts = CONTACTS.map(({ v }) => ({ v, count: shots.filter((s) => s.contact === v).length })).filter((c) => c.count > 0);
        return { club, count: shots.length, counts, score: contactScore(counts) };
      })
      .sort((a, b) => b.score - a.score);

    // Qualité de contact par zone de jeu (roughs fusionnés, côté ignoré)
    const zonesPlayed = ["Départ", "Fairway", "Rough", "Bunker", "Avant-green"];
    const contactByZone = zonesPlayed
      .map((zone) => {
        const shots = allShots.filter((s) => s.zoneStart === zone);
        const counts = CONTACTS.map(({ v }) => ({ v, count: shots.filter((s) => s.contact === v).length })).filter((c) => c.count > 0);
        return { zone, count: shots.length, counts, score: contactScore(counts) };
      })
      .filter((z) => z.count > 0)
      .sort((a, b) => b.score - a.score);

    // Zones de réception des coups de départ (rough détaillé par côté)
    const teeShots = allShots.filter((s) => s.zoneStart === "Départ");
    const teeLandingMap = new Map();
    teeShots.forEach((s) => {
      if (!s.zoneEnd) return;
      const key = s.zoneEnd === "Rough" && s.sideEnd ? `Rough (${s.sideEnd})` : s.zoneEnd;
      teeLandingMap.set(key, (teeLandingMap.get(key) || 0) + 1);
    });
    const teeLanding = [...teeLandingMap.entries()]
      .map(([z, count]) => ({ z, count }))
      .sort((a, b) => b.count - a.count);

    return (
      <div className="min-h-screen bg-stone-50 pb-10">
        <div className="bg-emerald-900 text-white px-5 pt-8 pb-6">
          <button onClick={() => setScreen("home")} className="text-emerald-200 mb-3"><Home size={20} /></button>
          <h1 className="text-xl font-bold">{round.courseName}</h1>
          <div className="text-emerald-200 text-sm flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={round.date}
              onChange={(e) => updateRoundDate(e.target.value)}
              className="bg-emerald-800 text-white rounded px-1.5 py-0.5 text-sm border border-emerald-700"
            />
            · {round.holes.length} trous · hcp de jeu {round.ph}{round.tee ? ` · départ ${round.tee.toLowerCase()}` : ""}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Score brut" value={totalStrokes} sub={`${totalStrokes - totalPar >= 0 ? "+" : ""}${totalStrokes - totalPar}`} />
            <Stat label="Score net" value={totalNet} sub={`${totalNet - totalPar >= 0 ? "+" : ""}${totalNet - totalPar}`} />
            <Stat label="Stableford" value={totalPts} />
            <Stat label="Fairways" value={`${firHit}/${par4plus.length}`} />
            <Stat label="GIR" value={`${girHit}/${round.holes.length}`} />
            <Stat label="Scrambles" value={scrambles.length} />
            <Stat label="Putts" value={round.holes.reduce((s, h) => s + (h.putts?.count || 0), 0)} />
            {differential !== null && (
              <Stat label="Différentiel (indicatif)" value={differential} sub={`slope ${round.rating.slope} · CR ${round.rating.sss}`} />
            )}
          </div>
          {differential !== null && (
            <p className="text-xs text-stone-400 -mt-2">
              Indicatif seulement : calculé sur le score brut sans plafonnement type "net double bogey" ni ajustement 9 trous officiel — ne remplace pas un différentiel WHS validé par un marqueur.
            </p>
          )}

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
                <tr><th className="p-2 text-left">Trou</th><th className="p-2">Par</th><th className="p-2">Brut</th><th className="p-2">Net</th><th className="p-2">Putts</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {round.holes.map((h, i) => {
                  const strokes = holeStrokes(h);
                  const net = strokes - strokesRecu(h.hcp, round.ph, round.totalHolesRef);
                  return (
                    <tr key={h.numero} className="border-t border-stone-100">
                      <td className="p-2 font-medium">{h.numero}</td>
                      <td className="p-2 text-center">{h.par}</td>
                      <td className="p-2 text-center">{strokes || "-"}</td>
                      <td className="p-2 text-center">{h.putts ? net : "-"}</td>
                      <td className="p-2 text-center">{h.putts ? h.putts.count : "-"}</td>
                      <td className="p-2 text-center">
                        <button onClick={() => goToHole(i)} className="text-xs text-emerald-800 underline">
                          {h.putts ? "modifier" : "saisir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-300 font-semibold bg-stone-50">
                  <td className="p-2">Total</td>
                  <td className="p-2 text-center">{totalPar}</td>
                  <td className="p-2 text-center">{totalStrokes}</td>
                  <td className="p-2 text-center">{totalNet}</td>
                  <td className="p-2 text-center">{round.holes.reduce((s, h) => s + (h.putts?.count || 0), 0)}</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-stone-400">Tape "saisir"/"modifier" sur un trou pour y entrer ou corriger des coups — rien n'est perdu en changeant de trou.</p>

          {byParType.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Par type de trou</div>
              <div className="flex gap-3">
                {byParType.map((p) => (
                  <div key={p.par} className="flex-1 text-center bg-stone-50 rounded-xl py-2">
                    <div className="text-xs text-stone-400">Par {p.par} ({p.count})</div>
                    <div className="text-lg font-bold">{p.avg.toFixed(1)}</div>
                    <div className="text-xs text-stone-400">{(p.avg - p.par >= 0 ? "+" : "")}{(p.avg - p.par).toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(contactCounts.length > 0 || totalPenalties > 0) && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              {contactCounts.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Qualité de contact ({allShots.length} coups)</div>
                  <div className="flex flex-wrap gap-2">
                    {contactCounts.map((c) => (
                      <span key={c.v} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">{c.v} <span className="font-semibold">{c.count}</span></span>
                    ))}
                  </div>
                </div>
              )}
              {totalPenalties > 0 && (
                <div>
                  <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Pénalités ({totalPenalties})</div>
                  <div className="flex flex-wrap gap-2">
                    {penaltyCounts.map((p) => (
                      <span key={p.v} className="text-xs bg-red-50 text-red-700 rounded-full px-2.5 py-1">{p.v} <span className="font-semibold">{p.count}</span></span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {teeLanding.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Réception des coups de départ ({teeShots.length})</div>
              <div className="flex flex-wrap gap-2">
                {teeLanding.map((t) => (
                  <span key={t.z} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">
                    {t.z} <span className="font-semibold">{t.count}</span> <span className="text-stone-400">({Math.round((t.count / teeShots.length) * 100)}%)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {contactByClub.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Qualité de contact par club</div>
              <p className="text-xs text-stone-400 mb-3">Du club le mieux frappé au moins bien frappé.</p>
              <div className="space-y-2.5">
                {contactByClub.map((c) => (
                  <div key={c.club}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-semibold">{c.club} <span className="text-stone-400 font-normal">({c.count})</span></span>
                      <span className="text-stone-400">{Math.round(c.score * 100)}/100</span>
                    </div>
                    <ContactBar counts={c.counts} total={c.count} />
                  </div>
                ))}
              </div>
              <ContactLegend />
            </div>
          )}

          {contactByZone.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Qualité de contact par zone</div>
              <p className="text-xs text-stone-400 mb-3">De la zone la mieux jouée à la moins bien jouée. Roughs gauche et droite regroupés.</p>
              <div className="space-y-2.5">
                {contactByZone.map((z) => (
                  <div key={z.zone}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-semibold">{z.zone} <span className="text-stone-400 font-normal">({z.count})</span></span>
                      <span className="text-stone-400">{Math.round(z.score * 100)}/100</span>
                    </div>
                    <ContactBar counts={z.counts} total={z.count} />
                  </div>
                ))}
              </div>
              <ContactLegend />
            </div>
          )}

          {holesWithPutts.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase">Détail putting</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-stone-50 rounded-xl py-2">
                  <div className="text-lg font-bold">{avgPutts.toFixed(2)}</div>
                  <div className="text-xs text-stone-400">putts/trou</div>
                </div>
                <div className="bg-stone-50 rounded-xl py-2">
                  <div className="text-lg font-bold">{onePutts}</div>
                  <div className="text-xs text-stone-400">1-putt</div>
                </div>
                <div className="bg-stone-50 rounded-xl py-2">
                  <div className="text-lg font-bold">{threePutts}</div>
                  <div className="text-xs text-stone-400">3-putts et +</div>
                </div>
              </div>
              {puttsByDist.length > 0 && (
                <div>
                  <div className="text-xs text-stone-400 mb-1">Réussite selon la distance du 1er putt</div>
                  <div className="flex flex-wrap gap-2">
                    {puttsByDist.map((p) => (
                      <span key={p.d} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">{p.d} : {p.oneOff}/{p.count} en 1</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={copyCSV} className="w-full bg-emerald-900 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 active:scale-95">
            {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? "Copié !" : "Copier le tableau (CSV)"}
          </button>
          <textarea readOnly value={buildCSV(round)} className="w-full h-32 text-xs font-mono bg-white border border-stone-200 rounded-xl p-2" />
        </div>
      </div>
    );
  }

  return null;
}

// Note de contact 0..1 (Topé = 0, Pur = 1), pour classer clubs/zones du meilleur au moins bon.
function contactScore(counts) {
  let sum = 0;
  let n = 0;
  counts.forEach(({ v, count }) => {
    const i = CONTACTS.findIndex((c) => c.v === v);
    if (i >= 0) {
      sum += (i / (CONTACTS.length - 1)) * count;
      n += count;
    }
  });
  return n ? sum / n : 0;
}

// Barre empilée : segments du plus mauvais contact (gauche, rouge) au meilleur (droite, vert).
function ContactBar({ counts, total }) {
  const ordered = CONTACTS.map(({ v, bar }) => {
    const found = counts.find((c) => c.v === v);
    return found ? { v, bar, count: found.count } : null;
  }).filter(Boolean);
  return (
    <div className="flex h-4 rounded-full overflow-hidden bg-stone-100">
      {ordered.map((o) => (
        <div
          key={o.v}
          className={o.bar}
          style={{ width: `${(o.count / total) * 100}%` }}
          title={`${o.v} : ${o.count}`}
        />
      ))}
    </div>
  );
}

// Barre empilée des zones de réception, de la meilleure (vert) à la pire (rouge).
// Étiquette d'axe sur deux lignes : date au-dessus, code parcours en dessous.
function RoundTick({ x, y, payload, data }) {
  const row = data.find((d) => d.date === payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="#78716c" fontSize={9}>{payload.value?.slice(5)}</text>
      <text x={0} y={0} dy={22} textAnchor="middle" fill="#a8a29e" fontSize={9} fontWeight="600">{row?.code || ""}</text>
    </g>
  );
}

function LandingBar({ counts, total }) {
  const ordered = LANDING_ZONES.map(({ z, bar }) => {
    const found = counts.find((c) => c.z === z);
    return found ? { z, bar, count: found.count } : null;
  }).filter(Boolean);
  return (
    <div className="flex h-4 rounded-full overflow-hidden bg-stone-100">
      {ordered.map((o) => (
        <div key={o.z} className={o.bar} style={{ width: `${(o.count / total) * 100}%` }} title={`${o.z} : ${o.count}`} />
      ))}
    </div>
  );
}

function LandingLegend() {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
      {LANDING_ZONES.map(({ z, bar }) => (
        <span key={z} className="flex items-center gap-1 text-xs text-stone-400">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bar}`} />
          {z}
        </span>
      ))}
    </div>
  );
}

function ContactLegend() {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
      {CONTACTS.map(({ v, bar }) => (
        <span key={v} className="flex items-center gap-1 text-xs text-stone-400">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bar}`} />
          {v}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
      <div className="text-xs text-stone-400 uppercase">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  );
}

function NoteField({ initial, onChange, onCommit }) {
  const [text, setText] = useState(initial || "");
  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={onCommit}
      placeholder="Remarque (optionnel) — vent, lie improbable, contexte…"
      className="w-full text-sm border border-stone-200 rounded-xl p-2 bg-white"
      rows={2}
    />
  );
}

function PuttsCard({ onSave }) {
  const [count, setCount] = useState(2);
  const [dist, setDist] = useState(null);
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
      <div className="text-xs font-semibold text-stone-500 uppercase">Green atteint — putts</div>
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setCount(Math.max(0, count - 1))} className="w-10 h-10 rounded-full bg-stone-100 text-xl font-bold">−</button>
        <div className="text-3xl font-bold w-10 text-center">{count}</div>
        <button onClick={() => setCount(count + 1)} className="w-10 h-10 rounded-full bg-stone-100 text-xl font-bold">+</button>
      </div>
      <div>
        <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Distance du 1er putt</div>
        <div className="flex flex-wrap gap-2">
          {PUTT_DIST.map((d) => (
            <Pill key={d} active={dist === d} onClick={() => setDist(d)}>{d}</Pill>
          ))}
        </div>
      </div>
      <button onClick={() => onSave(count, dist)} className="w-full bg-emerald-900 text-white rounded-xl py-3 font-semibold active:scale-95">
        Valider le trou
      </button>
    </div>
  );
}

function SetupScreen({ onBack, onStart, customCourses }) {
  const [courseId, setCourseId] = useState(null);
  const [customName, setCustomName] = useState("");
  const [nb, setNb] = useState(9);
  const [startHole, setStartHole] = useState(1);
  const [ph, setPh] = useState(44);
  const [tee, setTee] = useState("Bleus");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const allCourses = [...COURSES, ...customCourses];
  const course = allCourses.find((c) => c.id === courseId);

  return (
    <div className="min-h-screen bg-stone-50 pb-10">
      <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-center gap-3">
        <button onClick={onBack}><X size={22} /></button>
        <h1 className="text-xl font-bold">Nouvelle partie</h1>
      </div>
      <div className="p-5 space-y-5">
        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Date de la partie</div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-stone-300 rounded-lg px-3 py-2" />
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Parcours</div>
          <div className="flex flex-wrap gap-2">
            {allCourses.map((c) => (
              <Pill key={c.id} active={courseId === c.id} onClick={() => { setCourseId(c.id); setNb(Math.min(nb, c.nb)); setStartHole(1); }}>{c.nom}</Pill>
            ))}
            <Pill active={courseId === null && customName !== "__flag__"} onClick={() => setCourseId(null)}>Autre</Pill>
          </div>
          {courseId === null && (
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nom du parcours"
              className="mt-2 w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Trous joués</div>
          <div className="flex gap-2">
            {[9, 18].map((n) => (
              <Pill key={n} active={nb === n} onClick={() => setNb(n)} className="flex-1 text-center">{n} trous</Pill>
            ))}
          </div>
        </div>

        {course && (
          <div>
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Trou de départ (si non standard)</div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: course.nb }, (_, i) => i + 1).map((n) => (
                <Pill key={n} active={startHole === n} onClick={() => setStartHole(n)}>{n}</Pill>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Handicap de jeu</div>
          <input type="number" value={ph} onChange={(e) => setPh(Number(e.target.value))} className="w-24 border border-stone-300 rounded-lg px-3 py-2" />
        </div>

        {course && (
          <div>
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Départ (couleur)</div>
            <div className="flex gap-2">
              {TEES.map((t) => (
                <Pill key={t} active={tee === t} onClick={() => setTee(t)}>{t}</Pill>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() =>
            onStart({
              courseId,
              courseName: course ? course.nom : (customName || "Parcours"),
              nbToPlay: nb,
              startHole,
              ph,
              tee,
              date,
            })
          }
          className="w-full bg-amber-600 text-white rounded-xl py-3 font-semibold active:scale-95"
        >
          Commencer
        </button>
      </div>
    </div>
  );
}

function DashboardScreen({ onBack, fetchAllRounds, roundCount }) {
  const [loading, setLoading] = useState(true);
  const [allRounds, setAllRounds] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const all = await fetchAllRounds();
      setAllRounds(all);
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  function applyPreset(preset) {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (preset === "all") {
      setFrom("");
      setTo("");
    } else if (preset === "12m") {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      setFrom(iso(d));
      setTo(iso(now));
    } else if (preset === "year") {
      setFrom(`${now.getFullYear()}-01-01`);
      setTo(iso(now));
    } else if (preset === "3m") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      setFrom(iso(d));
      setTo(iso(now));
    }
  }

  // Filtre par période. Les dates sont au format ISO (AAAA-MM-JJ), donc comparables telles quelles.
  const rounds = allRounds.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
  const isFiltered = Boolean(from || to);

  const filterBar = (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
      <div className="text-xs font-semibold text-stone-500 uppercase">Période</div>
      <div className="flex flex-wrap gap-2">
        <Pill active={!from && !to} onClick={() => applyPreset("all")}>Tout</Pill>
        <Pill active={false} onClick={() => applyPreset("3m")}>3 mois</Pill>
        <Pill active={false} onClick={() => applyPreset("12m")}>12 mois</Pill>
        <Pill active={false} onClick={() => applyPreset("year")}>Année en cours</Pill>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label className="text-stone-400">Du</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1" />
        <label className="text-stone-400">au</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1" />
      </div>
      {isFiltered && (
        <div className="text-xs text-stone-400">
          {rounds.length} partie{rounds.length > 1 ? "s" : ""} sur {allRounds.length} · <button onClick={() => applyPreset("all")} className="underline">tout afficher</button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-400">Chargement du tableau de bord…</div>;
  }

  // Toutes les trous joués (avec putts renseignés), sur la période retenue.
  const allHoles = rounds.flatMap((r) =>
    r.holes.filter((h) => h.putts).map((h) => ({ ...h, _ph: r.ph, _totalHolesRef: r.totalHolesRef }))
  );

  if (allHoles.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 pb-10">
        <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-center gap-3">
          <button onClick={onBack}><X size={22} /></button>
          <h1 className="text-xl font-bold">Tableau de bord</h1>
        </div>
        <div className="p-5 space-y-4">
          {filterBar}
          <p className="text-stone-400 text-sm">
            {isFiltered
              ? "Aucune partie saisie sur cette période — élargis les dates ci-dessus."
              : "Pas encore assez de données — joue et termine au moins un trou pour voir apparaître des statistiques ici."}
          </p>
        </div>
      </div>
    );
  }

  const holeNet = (h) => holeStrokes(h) - strokesRecu(h.hcp, h._ph, h._totalHolesRef);
  const holePts = (h) => stableford(holeNet(h), h.par);

  const totalEcart = allHoles.reduce((s, h) => s + (holeStrokes(h) - h.par), 0);
  const avgEcart = totalEcart / allHoles.length;
  const totalPts = allHoles.reduce((s, h) => s + holePts(h), 0);
  const avgPts = totalPts / allHoles.length;

  // Toutes les parties ayant au moins un trou saisi. Les métriques étant normalisées par trou,
  // une partie partielle (ex. 9 trous joués sur un 18) reste comparable — seul le différentiel,
  // qui se calcule sur un total, exige une partie entièrement jouée.
  const playedRounds = rounds
    .map((r) => {
      const holes = r.holes.filter((h) => h.putts);
      if (!holes.length) return null;
      const ecartTrou = holes.reduce((s, h) => s + (holeStrokes(h) - h.par), 0) / holes.length;
      const ptsTrou = holes.reduce((s, h) => s + stableford(holeStrokes(h) - strokesRecu(h.hcp, r.ph, r.totalHolesRef), h.par), 0) / holes.length;
      const isFull = r.holes.length > 0 && r.holes.every((h) => h.putts);
      const differential = isFull && r.rating ? Math.round(((holes.reduce((s, h) => s + holeStrokes(h), 0) - r.rating.sss) * 113) / r.rating.slope * 10) / 10 : null;
      return { date: r.date, courseName: r.courseName, nbHoles: holes.length, isFull, ecartTrou, ptsTrou, differential };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const bestRound = playedRounds.length ? playedRounds.reduce((a, b) => (b.ecartTrou < a.ecartTrou ? b : a)) : null;
  const worstRound = playedRounds.length ? playedRounds.reduce((a, b) => (b.ecartTrou > a.ecartTrou ? b : a)) : null;
  const roundsWithDiff = playedRounds.filter((r) => r.differential !== null);

  const byParType = [3, 4, 5].map((par) => {
    const holes = allHoles.filter((h) => h.par === par);
    const strokes = holes.reduce((s, h) => s + holeStrokes(h), 0);
    return { par, count: holes.length, avg: holes.length ? strokes / holes.length : null };
  }).filter((p) => p.count > 0);

  // --- Par club ---
  const allShots = rounds.flatMap((r) => r.holes.filter((h) => h.putts).flatMap((h) => h.shots));
  const clubNames = [...new Set(allShots.map((s) => s.club).filter(Boolean))];
  const byClub = clubNames
    .map((club) => {
      const shots = allShots.filter((s) => s.club === club);
      const counts = CONTACTS.map(({ v }) => ({ v, count: shots.filter((s) => s.contact === v).length })).filter((c) => c.count > 0);
      const penalties = shots.filter((s) => s.penalite).length;
      const noGain = shots.filter((s) => ["Sans gain", "Recul"].includes(s.progression)).length;
      const trajCounts = {};
      shots.forEach((s) => {
        if (s.trajectoire) trajCounts[s.trajectoire] = (trajCounts[s.trajectoire] || 0) + 1;
      });
      const domTraj = Object.entries(trajCounts).sort((a, b) => b[1] - a[1])[0];
      return { club, count: shots.length, counts, score: contactScore(counts), penalties, noGain, domTraj: domTraj ? domTraj[0] : null };
    })
    .sort((a, b) => b.score - a.score);

  // --- Par zone de départ du coup ---
  const zoneNames = ["Départ", "Fairway", "Rough", "Bunker", "Avant-green"];
  const byZone = zoneNames
    .map((zone) => {
      const shots = allShots.filter((s) => s.zoneStart === zone);
      const counts = CONTACTS.map(({ v }) => ({ v, count: shots.filter((s) => s.contact === v).length })).filter((c) => c.count > 0);
      const noGain = shots.filter((s) => ["Sans gain", "Recul"].includes(s.progression)).length;
      const wellAdvanced = shots.filter((s) => s.progression === "Avancé nettement").length;
      return { zone, count: shots.length, counts, score: contactScore(counts), noGain, wellAdvanced };
    })
    .filter((z) => z.count > 0)
    .sort((a, b) => b.score - a.score);

  // Sorties de rough par côté
  const roughShots = allShots.filter((s) => s.zoneStart === "Rough" && s.sideStart);
  const bySide = SIDES.map((side) => {
    const shots = roughShots.filter((s) => s.sideStart === side);
    const noGain = shots.filter((s) => ["Sans gain", "Recul"].includes(s.progression)).length;
    return { side, count: shots.length, noGain };
  }).filter((s) => s.count > 0);

  // --- Réception des coups de départ (toutes parties, rough détaillé par côté) ---
  const teeShotsAll = allShots.filter((s) => s.zoneStart === "Départ");
  const teeLandingMapAll = new Map();
  teeShotsAll.forEach((s) => {
    if (!s.zoneEnd) return;
    const key = s.zoneEnd === "Rough" && s.sideEnd ? `Rough (${s.sideEnd})` : s.zoneEnd;
    teeLandingMapAll.set(key, (teeLandingMapAll.get(key) || 0) + 1);
  });
  const teeLandingAll = [...teeLandingMapAll.entries()]
    .map(([z, count]) => ({ z, count }))
    .sort((a, b) => b.count - a.count);

  // --- Répartition des scores par partie (histogramme empilé) ---
  const scoreDistribution = rounds
    .map((r) => {
      const holes = r.holes.filter((h) => h.putts);
      if (!holes.length) return null;
      const row = { label: `${r.date}${r.courseName ? ` · ${r.courseName.slice(0, 12)}` : ""}`, date: r.date, code: courseCode(r.courseName), courseName: r.courseName };
      SCORE_CATS.forEach((c) => {
        row[c.key] = holes.filter((h) => c.test(holeStrokes(h) - h.par)).length;
      });
      return row;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const activeScoreCats = SCORE_CATS.filter((c) => scoreDistribution.some((r) => r[c.key] > 0));

  // --- Zones de réception par club ---
  const landingByClub = clubNames
    .map((club) => {
      const shots = allShots.filter((s) => s.club === club && s.zoneEnd);
      if (!shots.length) return null;
      const counts = LANDING_ZONES.map(({ z }) => ({ z, count: shots.filter((s) => s.zoneEnd === z).length })).filter((c) => c.count > 0);
      const score = counts.reduce((sum, c) => sum + (LANDING_ZONES.find((l) => l.z === c.z)?.score || 0) * c.count, 0) / shots.length;
      const roughSides = SIDES.map((side) => ({ side, count: shots.filter((s) => s.zoneEnd === "Rough" && s.sideEnd === side).length })).filter((s) => s.count > 0);
      return { club, count: shots.length, counts, score, roughSides };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // --- Par parcours ---
  const courseNames = [...new Set(rounds.map((r) => r.courseName))];
  const byCourse = courseNames
    .map((name) => {
      const rs = rounds.filter((r) => r.courseName === name);
      const holes = rs.flatMap((r) => r.holes.filter((h) => h.putts));
      if (!holes.length) return null;
      const ecartTrou = holes.reduce((s, h) => s + (holeStrokes(h) - h.par), 0) / holes.length;
      return { name, nbRounds: rs.length, nbHoles: holes.length, ecartTrou };
    })
    .filter(Boolean)
    .sort((a, b) => a.ecartTrou - b.ecartTrou);

  // Trous noirs : trous joués au moins 2 fois sur un même parcours, triés par écart moyen
  const holeKeyMap = new Map();
  rounds.forEach((r) => {
    r.holes.filter((h) => h.putts).forEach((h) => {
      const key = `${r.courseName}|${h.numero}`;
      if (!holeKeyMap.has(key)) holeKeyMap.set(key, { courseName: r.courseName, numero: h.numero, par: h.par, ecarts: [] });
      holeKeyMap.get(key).ecarts.push(holeStrokes(h) - h.par);
    });
  });
  const blackHoles = [...holeKeyMap.values()]
    .filter((h) => h.ecarts.length >= 2)
    .map((h) => ({ ...h, avgEcart: h.ecarts.reduce((s, e) => s + e, 0) / h.ecarts.length }))
    .sort((a, b) => b.avgEcart - a.avgEcart)
    .slice(0, 5);

  // --- Putting global ---
  const totalPuttsAll = allHoles.reduce((s, h) => s + h.putts.count, 0);
  const avgPuttsAll = totalPuttsAll / allHoles.length;
  const onePuttsAll = allHoles.filter((h) => h.putts.count === 1).length;
  const threePuttsAll = allHoles.filter((h) => h.putts.count >= 3).length;
  const puttsByDistAll = PUTT_DIST.map((d) => {
    const holes = allHoles.filter((h) => h.putts.firstPuttDist === d);
    const oneOff = holes.filter((h) => h.putts.count === 1).length;
    return { d, count: holes.length, oneOff };
  }).filter((p) => p.count > 0);

  // Histogramme empilé : pour chaque distance de 1er putt, combien de trous en 1, 2, 3, 4+ putts.
  // Les trous sans distance de 1er putt renseignée sont exclus (comptés à part pour être transparent).
  const puttDistHistogram = PUTT_DIST.map((d) => {
    const holes = allHoles.filter((h) => h.putts.firstPuttDist === d);
    const row = { d, total: holes.length };
    PUTT_CATS.forEach((c) => {
      row[c.key] = holes.filter((h) => c.test(h.putts.count)).length;
    });
    return row;
  }).filter((r) => r.total > 0);
  const activePuttCats = PUTT_CATS.filter((c) => puttDistHistogram.some((r) => r[c.key] > 0));
  const holesWithoutPuttDist = allHoles.filter((h) => !h.putts.firstPuttDist).length;

  // --- Pénalités globales ---
  const penaltyCountsAll = PENALTIES.map((p) => ({ v: p.v, count: allShots.filter((s) => s.penalite === p.v).length })).filter((p) => p.count > 0);
  const totalPenaltiesAll = penaltyCountsAll.reduce((s, p) => s + p.count, 0);
  const penaltiesPerRound = playedRounds.length ? totalPenaltiesAll / playedRounds.length : 0;

  return (
    <div className="min-h-screen bg-stone-50 pb-10">
      <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-center gap-3">
        <button onClick={onBack}><X size={22} /></button>
        <div>
          <h1 className="text-xl font-bold">Tableau de bord</h1>
          <div className="text-emerald-200 text-xs">
            {rounds.length} partie{rounds.length > 1 ? "s" : ""} · {allHoles.length} trous joués{isFiltered ? " · période filtrée" : ""}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {filterBar}

        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Vue d'ensemble</div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Écart/trou moyen" value={`${avgEcart >= 0 ? "+" : ""}${avgEcart.toFixed(2)}`} />
            <Stat label="Pts Stableford/trou" value={avgPts.toFixed(2)} />
            {bestRound && worstRound && bestRound.ecartTrou === worstRound.ecartTrou ? (
              <div className="col-span-2 bg-white rounded-xl border border-stone-200 p-3 text-center">
                <div className="text-xs text-stone-400 uppercase">Parties à égalité</div>
                <div className="text-xl font-bold">{bestRound.ecartTrou >= 0 ? "+" : ""}{bestRound.ecartTrou.toFixed(2)}/trou</div>
                <div className="text-xs text-stone-400">
                  {playedRounds.filter((r) => r.ecartTrou === bestRound.ecartTrou).map((r) => r.courseName).join(" · ")}
                </div>
              </div>
            ) : (
              <>
                {bestRound && (
                  <Stat label="Meilleure partie" value={`${bestRound.ecartTrou >= 0 ? "+" : ""}${bestRound.ecartTrou.toFixed(2)}/trou`} sub={`${bestRound.courseName} · ${bestRound.date}${bestRound.isFull ? "" : ` · ${bestRound.nbHoles} trous`}`} />
                )}
                {worstRound && playedRounds.length > 1 && (
                  <Stat label="Partie la + difficile" value={`${worstRound.ecartTrou >= 0 ? "+" : ""}${worstRound.ecartTrou.toFixed(2)}/trou`} sub={`${worstRound.courseName} · ${worstRound.date}${worstRound.isFull ? "" : ` · ${worstRound.nbHoles} trous`}`} />
                )}
              </>
            )}
          </div>
        </div>

        {playedRounds.length >= 2 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Progression (écart/trou et Stableford/trou)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={playedRounds} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ecartTrou" name="Écart/trou" stroke="#1F3D2B" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ptsTrou" name="Pts/trou" stroke="#B8935A" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {roundsWithDiff.length >= 2 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Différentiel indicatif</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={roundsWithDiff} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="differential" name="Différentiel" stroke="#1F3D2B" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {scoreDistribution.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Répartition des scores par partie</div>
            <p className="text-xs text-stone-400 mb-2">Nombre de trous par catégorie, partie après partie. "Quad+" regroupe les trous à +4 et au-delà.</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={scoreDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={<RoundTick data={scoreDistribution} />} interval={0} height={34} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={(d, p) => (p && p[0] ? `${d} · ${p[0].payload.courseName}` : d)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {activeScoreCats.map((c) => (
                  <Bar key={c.key} dataKey={c.key} name={c.label} stackId="s" fill={c.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {byParType.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Par type de trou (toutes parties)</div>
            <div className="flex gap-3">
              {byParType.map((p) => (
                <div key={p.par} className="flex-1 text-center bg-stone-50 rounded-xl py-2">
                  <div className="text-xs text-stone-400">Par {p.par} ({p.count})</div>
                  <div className="text-lg font-bold">{p.avg.toFixed(1)}</div>
                  <div className="text-xs text-stone-400">{(p.avg - p.par >= 0 ? "+" : "")}{(p.avg - p.par).toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {teeLandingAll.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Réception des coups de départ ({teeShotsAll.length})</div>
            <div className="flex flex-wrap gap-2">
              {teeLandingAll.map((t) => (
                <span key={t.z} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">
                  {t.z} <span className="font-semibold">{t.count}</span> <span className="text-stone-400">({Math.round((t.count / teeShotsAll.length) * 100)}%)</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {byClub.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Par club</div>
            <p className="text-xs text-stone-400 mb-3">Du club le mieux frappé au moins bien frappé, toutes parties confondues.</p>
            <div className="space-y-3">
              {byClub.map((c) => (
                <div key={c.club}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold">{c.club} <span className="text-stone-400 font-normal">({c.count})</span></span>
                    <span className="text-stone-400">{Math.round(c.score * 100)}/100</span>
                  </div>
                  <ContactBar counts={c.counts} total={c.count} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-stone-400">
                    <span>sans gain/recul {Math.round((c.noGain / c.count) * 100)}%</span>
                    {c.penalties > 0 && <span className="text-red-600">pénalités {c.penalties}</span>}
                    {c.domTraj && <span>traj. {c.domTraj}</span>}
                  </div>
                </div>
              ))}
            </div>
            <ContactLegend />
          </div>
        )}

        {landingByClub.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Zones de réception par club</div>
            <p className="text-xs text-stone-400 mb-3">Du club qui place le mieux la balle au moins bon.</p>
            <div className="space-y-3">
              {landingByClub.map((c) => (
                <div key={c.club}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold">{c.club} <span className="text-stone-400 font-normal">({c.count})</span></span>
                    <span className="text-stone-400">{Math.round(c.score * 100)}/100</span>
                  </div>
                  <LandingBar counts={c.counts} total={c.count} />
                  {c.roughSides.length > 0 && (
                    <div className="text-xs text-stone-400 mt-1">
                      rough : {c.roughSides.map((s) => `${s.side} ${s.count}`).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <LandingLegend />
          </div>
        )}

        {byZone.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Par zone de départ du coup</div>
            <p className="text-xs text-stone-400 mb-3">De la zone la mieux jouée à la moins bien jouée. Roughs gauche et droite regroupés.</p>
            <div className="space-y-3">
              {byZone.map((z) => (
                <div key={z.zone}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold">{z.zone} <span className="text-stone-400 font-normal">({z.count})</span></span>
                    <span className="text-stone-400">{Math.round(z.score * 100)}/100</span>
                  </div>
                  <ContactBar counts={z.counts} total={z.count} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-stone-400">
                    <span className="text-emerald-700">avancé nettement {Math.round((z.wellAdvanced / z.count) * 100)}%</span>
                    <span className="text-red-600">sans gain/recul {Math.round((z.noGain / z.count) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <ContactLegend />
            {bySide.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <div className="text-xs text-stone-400 mb-1">Sorties de rough par côté (% sans gain / recul)</div>
                <div className="flex flex-wrap gap-2">
                  {bySide.map((s) => (
                    <span key={s.side} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">
                      {s.side} : {Math.round((s.noGain / s.count) * 100)}% <span className="text-stone-400">({s.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {byCourse.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Par parcours</div>
            <table className="w-full text-xs">
              <thead className="text-stone-400 uppercase">
                <tr>
                  <th className="p-1 text-left">Parcours</th>
                  <th className="p-1">Parties</th>
                  <th className="p-1">Trous</th>
                  <th className="p-1">Écart/trou</th>
                </tr>
              </thead>
              <tbody>
                {byCourse.map((c) => (
                  <tr key={c.name} className="border-t border-stone-100">
                    <td className="p-1 font-medium">{c.name}</td>
                    <td className="p-1 text-center">{c.nbRounds}</td>
                    <td className="p-1 text-center">{c.nbHoles}</td>
                    <td className="p-1 text-center font-semibold">{c.ecartTrou >= 0 ? "+" : ""}{c.ecartTrou.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {blackHoles.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-2">Trous noirs récurrents</div>
            <div className="space-y-1">
              {blackHoles.map((h) => (
                <div key={`${h.courseName}-${h.numero}`} className="flex justify-between text-xs border-b border-stone-100 pb-1">
                  <span>{h.courseName} · trou {h.numero} (par {h.par})</span>
                  <span className="font-semibold text-red-600">+{h.avgEcart.toFixed(1)} <span className="text-stone-400 font-normal">({h.ecarts.length}×)</span></span>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">Trous joués au moins 2 fois, classés par écart moyen au par.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <div className="text-xs font-semibold text-stone-500 uppercase">Putting global</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-stone-50 rounded-xl py-2">
              <div className="text-lg font-bold">{avgPuttsAll.toFixed(2)}</div>
              <div className="text-xs text-stone-400">putts/trou</div>
            </div>
            <div className="bg-stone-50 rounded-xl py-2">
              <div className="text-lg font-bold">{onePuttsAll}</div>
              <div className="text-xs text-stone-400">1-putt</div>
            </div>
            <div className="bg-stone-50 rounded-xl py-2">
              <div className="text-lg font-bold">{threePuttsAll}</div>
              <div className="text-xs text-stone-400">3-putts et +</div>
            </div>
          </div>
          {puttsByDistAll.length > 0 && (
            <div>
              <div className="text-xs text-stone-400 mb-1">Réussite selon la distance du 1er putt</div>
              <div className="flex flex-wrap gap-2">
                {puttsByDistAll.map((p) => (
                  <span key={p.d} className="text-xs bg-stone-100 rounded-full px-2.5 py-1">{p.d} : {p.oneOff}/{p.count} en 1</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {puttDistHistogram.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Répartition des putts par distance</div>
            <p className="text-xs text-stone-400 mb-2">
              Nombre de trous par distance du 1er putt, réparti selon le nombre de putts joués.
              {holesWithoutPuttDist > 0 && ` ${holesWithoutPuttDist} trou${holesWithoutPuttDist > 1 ? "s" : ""} sans distance renseignée, non repris ici.`}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={puttDistHistogram} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="d" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {activePuttCats.map((c) => (
                  <Bar key={c.key} dataKey={c.key} name={c.label} stackId="p" fill={c.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {totalPenaltiesAll > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
            <div className="text-xs font-semibold text-stone-500 uppercase">Pénalités ({totalPenaltiesAll} · {penaltiesPerRound.toFixed(1)}/partie)</div>
            <div className="flex flex-wrap gap-2">
              {penaltyCountsAll.map((p) => (
                <span key={p.v} className="text-xs bg-red-50 text-red-700 rounded-full px-2.5 py-1">{p.v} <span className="font-semibold">{p.count}</span></span>
              ))}
            </div>
          </div>
        )}

        {playedRounds.length < 2 && (
          <p className="text-xs text-stone-400">La courbe de progression apparaîtra dès que tu auras au moins 2 parties avec des trous saisis.</p>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ onBack, clubs, customClubs, onAddClub, courses, onAddCourse, onSaveOverride, ratingOverrides, onSaveRating, onResetRating, customCourses, coursHoles, holeOverrides, onExportAllJSON, onExportAllCSV, onImportBackup, onImportCSV, roundCount, initialTab }) {
  const [tab, setTab] = useState(initialTab || "clubs"); // clubs | course | override | ratings | backup
  const [newClub, setNewClub] = useState("");

  const [courseName, setCourseName] = useState("");
  const [courseNb, setCourseNb] = useState(9);
  const [holeSpecs, setHoleSpecs] = useState(Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, hcp: i + 1 })));
  const [courseRatings, setCourseRatings] = useState(emptyRatings());
  const [ratingCfg, setRatingCfg] = useState("9 trous");

  const [ovCourseId, setOvCourseId] = useState(null);
  const [ovHole, setOvHole] = useState(1);
  const [ovPar, setOvPar] = useState(4);
  const [ovHcp, setOvHcp] = useState(1);
  const [ovSaved, setOvSaved] = useState(false);

  const [backupText, setBackupText] = useState("");
  const [backupCopied, setBackupCopied] = useState(false);
  const [csvBackupText, setCsvBackupText] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreMsg, setRestoreMsg] = useState(null);
  const [csvRestoreInput, setCsvRestoreInput] = useState("");
  const [csvRestoreMsg, setCsvRestoreMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  function resizeHoles(n) {
    setCourseNb(n);
    setHoleSpecs(Array.from({ length: n }, (_, i) => holeSpecs[i] || { numero: i + 1, par: 4, hcp: i + 1 }));
    setRatingCfg(n === 9 ? "9 trous" : "18 trous");
  }
  function updateHoleSpec(i, field, val) {
    setHoleSpecs(holeSpecs.map((h, idx) => (idx === i ? { ...h, [field]: val } : h)));
  }
  function updateRating(cfg, teeKey, field, val) {
    setCourseRatings({
      ...courseRatings,
      [cfg]: { ...courseRatings[cfg], [teeKey]: { ...courseRatings[cfg][teeKey], [field]: val } },
    });
  }
  function saveCourse() {
    if (!courseName.trim()) return;
    // On ne conserve que les départs où slope ET CR sont renseignés — un seul des deux
    // ne permet aucun calcul et donnerait un différentiel faux.
    const configs = courseNb === 9 ? CONFIGS_9 : CONFIGS_18;
    const ratings = {};
    configs.forEach((cfg) => {
      const tees = {};
      TEES.forEach((t) => {
        const k = t.toLowerCase();
        const r = courseRatings[cfg][k];
        if (r && r.slope !== "" && r.sss !== "") tees[k] = { slope: Number(r.slope), sss: Number(r.sss) };
      });
      if (Object.keys(tees).length) ratings[cfg] = tees;
    });
    onAddCourse({
      id: `custom-${uid()}`,
      nom: courseName.trim(),
      nb: courseNb,
      holes: holeSpecs,
      ratings: Object.keys(ratings).length ? ratings : null,
    });
    setCourseName("");
    setCourseRatings(emptyRatings());
    setRatingCfg("9 trous");
    resizeHoles(9);
  }

  const [ratCourseId, setRatCourseId] = useState(null);
  const [ratCfg, setRatCfg] = useState(null);
  const [ratTees, setRatTees] = useState({});
  const [ratSaved, setRatSaved] = useState(false);

  const ratCourse = courses.find((c) => c.id === ratCourseId);
  const ratConfigs = ratCourse ? (ratCourse.nb === 9 ? ["9 trous"] : ["18 trous", "Aller", "Retour"]) : [];

  useEffect(() => {
    if (!ratCourse || !ratCfg) return;
    const base = baseRating(ratCourseId, ratCfg, customCourses) || {};
    const ov = ratingOverrides[`${ratCourseId}_${ratCfg}`] || {};
    const merged = { ...base, ...ov };
    const next = {};
    TEES.forEach((t) => {
      const k = t.toLowerCase();
      next[k] = {
        slope: merged[k]?.slope ?? "",
        sss: merged[k]?.sss ?? "",
        overridden: Boolean(ov[k]),
        hasBase: Boolean(base[k]),
      };
    });
    setRatTees(next);
    setRatSaved(false);
    // eslint-disable-next-line
  }, [ratCourseId, ratCfg, ratingOverrides]);

  function updateRatTee(k, field, val) {
    setRatTees({ ...ratTees, [k]: { ...ratTees[k], [field]: val } });
    setRatSaved(false);
  }

  function saveRatings() {
    // On ne stocke que les départs qui diffèrent de l'origine et dont slope ET CR sont remplis.
    const base = baseRating(ratCourseId, ratCfg, customCourses) || {};
    const tees = {};
    TEES.forEach((t) => {
      const k = t.toLowerCase();
      const r = ratTees[k];
      if (!r || r.slope === "" || r.sss === "") return;
      const slope = Number(r.slope);
      const sss = Number(r.sss);
      if (base[k] && base[k].slope === slope && base[k].sss === sss) return;
      tees[k] = { slope, sss };
    });
    onSaveRating(ratCourseId, ratCfg, tees);
    setRatSaved(true);
  }

  const ovCourse = courses.find((c) => c.id === ovCourseId);
  useEffect(() => {
    if (ovCourse) {
      const h = coursHoles(ovCourseId).find((h) => h.numero === ovHole);
      if (h) {
        setOvPar(h.par);
        setOvHcp(h.hcp);
      }
    }
    setOvSaved(false);
    // eslint-disable-next-line
  }, [ovCourseId, ovHole]);

  async function generateJSONBackup() {
    setBusy(true);
    const text = await onExportAllJSON();
    setBackupText(text);
    setBusy(false);
  }
  async function generateCSVBackup() {
    setBusy(true);
    const text = await onExportAllCSV();
    setCsvBackupText(text);
    setBusy(false);
  }
  function copyBackup() {
    navigator.clipboard?.writeText(backupText);
    setBackupCopied(true);
    setTimeout(() => setBackupCopied(false), 1500);
  }
  async function doRestore() {
    setRestoreMsg(null);
    try {
      const res = await onImportBackup(restoreInput.trim());
      const n = res.rounds;
      let text = `${n} partie${n > 1 ? "s" : ""} restaurée${n > 1 ? "s" : ""}.`;
      if (res.settingsRestored) text += " Clubs, parcours et trous modifiés également restaurés.";
      else if (res.legacy) text += " Sauvegarde à l'ancien format : elle ne contenait pas les clubs/parcours personnalisés.";
      setRestoreMsg({ ok: true, text });
      setRestoreInput("");
    } catch (e) {
      setRestoreMsg({ ok: false, text: "Texte invalide — vérifie que c'est bien un collage complet de la sauvegarde JSON." });
    }
  }
  async function doRestoreCSV() {
    setCsvRestoreMsg(null);
    try {
      const n = await onImportCSV(csvRestoreInput);
      setCsvRestoreMsg({ ok: true, text: `${n} partie${n > 1 ? "s" : ""} reconstruite${n > 1 ? "s" : ""} à partir du CSV. Vérifie le handicap de jeu de chaque partie (mis à 44 par défaut, non stocké dans le CSV).` });
      setCsvRestoreInput("");
    } catch (e) {
      setCsvRestoreMsg({ ok: false, text: e.message || "CSV invalide ou incomplet — colle l'export tel quel, en-tête comprise." });
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-10">
      <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-center gap-3">
        <button onClick={onBack}><X size={22} /></button>
        <h1 className="text-xl font-bold">Parcours &amp; clubs</h1>
      </div>

      <div className="flex gap-2 px-5 pt-4 flex-wrap">
        <Pill active={tab === "clubs"} onClick={() => setTab("clubs")}>Clubs</Pill>
        <Pill active={tab === "course"} onClick={() => setTab("course")}>Nouveau parcours</Pill>
        <Pill active={tab === "override"} onClick={() => setTab("override")}>Modifier un trou</Pill>
        <Pill active={tab === "ratings"} onClick={() => setTab("ratings")}>Slope &amp; CR</Pill>
        <Pill active={tab === "backup"} onClick={() => setTab("backup")}>Sauvegarde</Pill>
      </div>

      <div className="p-5 space-y-5">
        {tab === "clubs" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Clubs existants</div>
              <div className="flex flex-wrap gap-2">
                {clubs.map((c) => <span key={c} className="px-3 py-1.5 rounded-full bg-stone-100 text-sm">{c}</span>)}
                {customClubs.map((c) => <span key={c} className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm">{c}</span>)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Ajouter un club</div>
              <div className="flex gap-2">
                <input value={newClub} onChange={(e) => setNewClub(e.target.value)} placeholder="ex: 3h, 6h, LW" className="flex-1 border border-stone-300 rounded-lg px-3 py-2" />
                <button
                  onClick={() => { onAddClub(newClub.trim()); setNewClub(""); }}
                  className="bg-emerald-900 text-white rounded-lg px-4 font-semibold"
                >
                  Ajouter
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-1">Le nouveau club apparaît dans le sélecteur dès ta prochaine partie.</p>
            </div>
          </div>
        )}

        {tab === "course" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Nom du parcours</div>
              <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Nom" className="w-full border border-stone-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Nombre de trous</div>
              <div className="flex gap-2">
                {[9, 18].map((n) => (
                  <Pill key={n} active={courseNb === n} onClick={() => resizeHoles(n)}>{n} trous</Pill>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Par / index de chaque trou</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {holeSpecs.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-6 font-medium">{h.numero}</span>
                    <div className="flex gap-1">
                      {[3, 4, 5].map((p) => (
                        <Pill key={p} active={h.par === p} onClick={() => updateHoleSpec(i, "par", p)} className="px-2 py-1 text-xs">Par {p}</Pill>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={h.hcp}
                      onChange={(e) => updateHoleSpec(i, "hcp", Number(e.target.value))}
                      className="w-16 border border-stone-300 rounded-lg px-2 py-1"
                      placeholder="Hcp"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Slope et CR par départ (optionnel)</div>
              <p className="text-xs text-stone-400 mb-2">
                Nécessaires au calcul du différentiel. Ils figurent sur la carte de score du parcours.
                Laisse vide si tu ne les as pas : tout le reste (score, Stableford, stats) fonctionne quand même.
                Renseigne au moins le départ que tu joues — slope ET CR, sinon la ligne est ignorée.
              </p>
              {courseNb === 18 && (
                <>
                  <p className="text-xs text-stone-400 mb-2">
                    Un 18 trous se joue aussi en aller ou en retour seul : chaque configuration a son
                    propre slope/CR sur la carte de score. Remplis celles que tu joues — c'est le même
                    parcours, donc tes stats restent regroupées.
                  </p>
                  <div className="flex gap-2 mb-2">
                    {CONFIGS_18.map((cfg) => (
                      <Pill key={cfg} active={ratingCfg === cfg} onClick={() => setRatingCfg(cfg)} className="px-2.5 py-1 text-xs">{cfg}</Pill>
                    ))}
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                {TEES.map((t) => {
                  const k = t.toLowerCase();
                  const cur = courseRatings[ratingCfg][k];
                  return (
                    <div key={t} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-xs font-medium">{t}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={cur.slope}
                        onChange={(e) => updateRating(ratingCfg, k, "slope", e.target.value)}
                        className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm"
                        placeholder="Slope"
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={cur.sss}
                        onChange={(e) => updateRating(ratingCfg, k, "sss", e.target.value)}
                        className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm"
                        placeholder="CR"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={saveCourse} disabled={!courseName.trim()} className="w-full bg-amber-600 disabled:bg-stone-300 text-white rounded-xl py-3 font-semibold active:scale-95">
              Enregistrer le parcours
            </button>
          </div>
        )}

        {tab === "override" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
            <p className="text-xs text-stone-400">Utile si un parcours change le par ou l'index d'un trou (rénovation, nouveau tracé). Fonctionne aussi bien sur un parcours intégré que sur un parcours ajouté ici.</p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              À corriger : les index (HCP) de <strong>Montgenèvre Chaberton</strong> et <strong>Montgenèvre Compact</strong> sont
              provisoires, déduits de la longueur des trous faute de carte à jour. Les pars et les slope/CR sont exacts.
              Seul le Stableford est concerné — corrige-les ici dès que tu auras la carte du club.
            </p>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Parcours</div>
              <div className="flex flex-wrap gap-2">
                {courses.map((c) => (
                  <Pill key={c.id} active={ovCourseId === c.id} onClick={() => { setOvCourseId(c.id); setOvHole(1); }}>{c.nom}</Pill>
                ))}
              </div>
            </div>
            {ovCourse && (
              <>
                <div>
                  <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Trou</div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: ovCourse.nb }, (_, i) => i + 1).map((n) => (
                      <Pill key={n} active={ovHole === n} onClick={() => setOvHole(n)}>{n}</Pill>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Par</div>
                    <div className="flex gap-1">
                      {[3, 4, 5].map((p) => (
                        <Pill key={p} active={ovPar === p} onClick={() => setOvPar(p)}>{p}</Pill>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Index (Hcp)</div>
                    <input type="number" value={ovHcp} onChange={(e) => setOvHcp(Number(e.target.value))} className="w-20 border border-stone-300 rounded-lg px-2 py-2" />
                  </div>
                </div>
                <button
                  onClick={() => { onSaveOverride(ovCourseId, ovHole, ovPar, ovHcp); setOvSaved(true); }}
                  className="w-full bg-amber-600 text-white rounded-xl py-3 font-semibold active:scale-95"
                >
                  {ovSaved ? "Enregistré ✓" : "Enregistrer la modification"}
                </button>
              </>
            )}
          </div>
        )}

        {tab === "ratings" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4">
            <p className="text-xs text-stone-400">
              Consulte et corrige le slope et le CR de chaque parcours. Les fédérations révisent
              périodiquement ces valeurs : si ta carte de score ne correspond plus à ce qui est affiché ici,
              corrige-le. Les parties déjà enregistrées gardent le rating en vigueur au moment où tu les as jouées.
            </p>
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Parcours</div>
              <div className="flex flex-wrap gap-2">
                {courses.map((c) => (
                  <Pill
                    key={c.id}
                    active={ratCourseId === c.id}
                    onClick={() => { setRatCourseId(c.id); setRatCfg(c.nb === 9 ? "9 trous" : "18 trous"); }}
                  >
                    {c.nom}
                  </Pill>
                ))}
              </div>
            </div>

            {ratCourse && (
              <>
                {ratConfigs.length > 1 && (
                  <div>
                    <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Configuration</div>
                    <div className="flex flex-wrap gap-2">
                      {ratConfigs.map((cfg) => (
                        <Pill key={cfg} active={ratCfg === cfg} onClick={() => setRatCfg(cfg)} className="px-2.5 py-1 text-xs">{cfg}</Pill>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="text-xs font-semibold text-stone-500 uppercase">Slope / CR par départ</div>
                    {TEES.some((t) => ratTees[t.toLowerCase()]?.overridden) && (
                      <button onClick={() => onResetRating(ratCourseId, ratCfg)} className="text-xs text-stone-400 underline">
                        rétablir l'origine
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {TEES.map((t) => {
                      const k = t.toLowerCase();
                      const r = ratTees[k] || { slope: "", sss: "" };
                      return (
                        <div key={t} className="flex items-center gap-2 text-sm">
                          <span className="w-16 text-xs font-medium">{t}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={r.slope}
                            onChange={(e) => updateRatTee(k, "slope", e.target.value)}
                            className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm"
                            placeholder="Slope"
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            value={r.sss}
                            onChange={(e) => updateRatTee(k, "sss", e.target.value)}
                            className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm"
                            placeholder="CR"
                          />
                          {r.overridden && <span className="text-xs text-amber-700">modifié</span>}
                          {!r.hasBase && !r.overridden && <span className="text-xs text-stone-300">non classé</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button onClick={saveRatings} className="w-full bg-amber-600 text-white rounded-xl py-3 font-semibold active:scale-95">
                  {ratSaved ? "Enregistré ✓" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        )}

        {tab === "backup" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase">Sauvegarde complète (restauration)</div>
              <p className="text-xs text-stone-400">
                Génère un bloc de texte contenant les {roundCount} partie{roundCount > 1 ? "s" : ""} enregistrée{roundCount > 1 ? "s" : ""}, ainsi que tes clubs ajoutés, parcours créés et trous modifiés. Colle-le et garde-le quelque part en dehors de l'artifact (note, email, Google Drive) — c'est ce texte qui permet de tout restaurer via "Restaurer une sauvegarde" ci-dessous, y compris après une dépublication accidentelle.
              </p>
              <button onClick={generateJSONBackup} disabled={busy} className="w-full bg-emerald-900 text-white rounded-xl py-3 font-semibold active:scale-95 disabled:opacity-50">
                {busy ? "Génération…" : "Générer la sauvegarde"}
              </button>
              {backupText && (
                <>
                  <textarea readOnly value={backupText} className="w-full h-32 text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl p-2" />
                  <button onClick={copyBackup} className="w-full bg-amber-600 text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 active:scale-95">
                    {backupCopied ? <Check size={16} /> : <Copy size={16} />} {backupCopied ? "Copié !" : "Copier la sauvegarde"}
                  </button>
                </>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase">Toutes les parties en CSV (pour Sheets)</div>
              <p className="text-xs text-stone-400">Un CSV par partie, à la suite — pratique pour coller dans Google Sheets, mais ne sert pas à restaurer (utilise la sauvegarde ci-dessus pour ça).</p>
              <button onClick={generateCSVBackup} disabled={busy} className="w-full bg-emerald-900 text-white rounded-xl py-3 font-semibold active:scale-95 disabled:opacity-50">
                {busy ? "Génération…" : "Générer le CSV de toutes les parties"}
              </button>
              {csvBackupText && (
                <textarea readOnly value={csvBackupText} className="w-full h-32 text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl p-2" />
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase">Restaurer une sauvegarde</div>
              <p className="text-xs text-stone-400">Colle ici le texte généré par "Générer la sauvegarde" (celui du dessus, pas le CSV). Les parties de même identifiant sont remplacées, les autres parties existantes sont conservées.</p>
              <textarea
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
                placeholder="Colle ici le texte de la sauvegarde…"
                className="w-full h-24 text-xs font-mono border border-stone-300 rounded-xl p-2"
              />
              <button onClick={doRestore} disabled={!restoreInput.trim()} className="w-full bg-amber-600 disabled:bg-stone-300 text-white rounded-xl py-3 font-semibold active:scale-95">
                Restaurer
              </button>
              {restoreMsg && (
                <p className={`text-xs ${restoreMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{restoreMsg.text}</p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase">Restaurer depuis un CSV</div>
              <p className="text-xs text-stone-400">
                Pour les cas où tu n'as qu'un export CSV (par exemple copié avant que la sauvegarde JSON existe). Colle l'export complet, en-tête comprise. Reconstruction best-effort : le handicap de jeu est repris de la colonne Handicap_jeu si elle est présente, sinon remis à 44 par défaut (exports faits avant l'ajout de cette colonne) — vérifie-le après coup sur chaque partie restaurée.
              </p>
              <textarea
                value={csvRestoreInput}
                onChange={(e) => setCsvRestoreInput(e.target.value)}
                placeholder="Colle ici l'export CSV complet (en-tête + lignes)…"
                className="w-full h-24 text-xs font-mono border border-stone-300 rounded-xl p-2"
              />
              <button onClick={doRestoreCSV} disabled={!csvRestoreInput.trim()} className="w-full bg-amber-600 disabled:bg-stone-300 text-white rounded-xl py-3 font-semibold active:scale-95">
                Restaurer depuis ce CSV
              </button>
              {csvRestoreMsg && (
                <p className={`text-xs ${csvRestoreMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{csvRestoreMsg.text}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
