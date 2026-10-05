// Calculs de score (coups rendus, net, Stableford, score ajusté, différentiel), sortis
// de GolfTracker.jsx pour pouvoir être testés seuls (voir scoring.test.js).

// Score réel du trou = coups swingués + coups fictifs de pénalité + putts.
export function holeStrokes(hole) {
  const penalties = hole.shots.filter((s) => s.penalite).length;
  return hole.shots.length + penalties + (hole.putts?.count || 0);
}

// Coups rendus sur un trou de rang `rank` (1 = le plus difficile) quand `ph` coups sont
// répartis sur `total` trous.
export function strokesRecu(rank, ph, total) {
  const base = Math.floor(ph / total);
  // Reste toujours positif (comme Python divmod), pas `ph % total` : l'opérateur % de JS
  // garde le signe du dividende, ce qui casserait la répartition pour un handicap de jeu
  // négatif (joueur meilleur que scratch, coups rendus AU parcours).
  const rest = ph - base * total;
  return base + (rank <= rest ? 1 : 0);
}

// Rang de difficulté (1..n) de chaque trou parmi les trous JOUÉS, d'après leur index
// (hcp) sur la carte. Indispensable sur un aller ou un retour d'un 18 trous : les index y
// vont de 1 à 18, alors que le handicap de jeu (calculé avec le slope/CR de ces 9 trous)
// se répartit sur 9 trous — sans reclassement, Évreux aller (index 1, 4, 5, 6, …) ne
// donnait le coup supplémentaire qu'aux trous d'index ≤ 4.
export function hcpRanks(holes) {
  const order = holes.map((h, i) => i).sort((a, b) => holes[a].hcp - holes[b].hcp || a - b);
  const ranks = new Array(holes.length);
  order.forEach((holeIdx, k) => {
    ranks[holeIdx] = k + 1;
  });
  return ranks;
}

// Coups rendus trou par trou : `ph` est le handicap de jeu des trous joués (voir
// handicapJeu()), donc réparti sur ces trous-là, jamais sur ceux du parcours entier.
export function strokesParTrou(holes, ph) {
  const ranks = hcpRanks(holes);
  return holes.map((h, i) => strokesRecu(ranks[i], ph, holes.length));
}

export function stableford(strokesNet, par) {
  return Math.max(0, 2 - (strokesNet - par));
}

// Arrondi WHS (moitié à l'écart de zéro) : Math.round arrondit -0.5 vers 0 au lieu de -1,
// ce qui ne suit pas la convention WHS pour un index négatif (meilleur que scratch).
export function roundHalfAwayFromZero(x) {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

// Handicap de jeu WHS (coups rendus au total) à partir de l'index du joueur (stable,
// indépendant du parcours) et du slope/CR/par du départ réellement joué. Le 9 trous n'a
// PAS de traitement à part : le CR9/Par9 du départ (propres à cette config, pas la moitié
// du 18 trous) portent déjà toute l'information nécessaire — diviser l'index par 2 en plus
// compterait le 9 trous deux fois. Vérifié contre une carte officielle FFGolf/Kady
// (Gonesse, index 35, slope 62, CR 33,8, par 36 -> 17, confirmé à l'identique).
export function handicapJeu(index, slope, cr, par) {
  return roundHalfAwayFromZero(index * (slope / 113) + (cr - par));
}

// Inverse de handicapJeu() (avant arrondi) : index retrouvé à partir du handicap de jeu
// d'une partie, pour les parties enregistrées avant que l'index soit conservé. Précis à
// l'arrondi du handicap de jeu près (±0,5 coup).
export function indexDepuisHandicapJeu(ph, slope, cr, par) {
  return ((ph - (cr - par)) * 113) / slope;
}

// Score ajusté WHS (SBA) : chaque trou plafonné au double bogey net (par + 2 + coups
// rendus de CE trou), condition du calcul officiel du différentiel — un score brut non
// plafonné gonflerait le différentiel sur un trou catastrophique.
export function scoreAjusteTrou(par, brut, rendus) {
  return Math.min(brut, par + 2 + rendus);
}
export function totalScoreAjuste(holes, ph) {
  const rendus = strokesParTrou(holes, ph);
  return holes.reduce((s, h, i) => s + scoreAjusteTrou(h.par, holeStrokes(h), rendus[i]), 0);
}

function arrondi1(x) {
  return Math.round(x * 10) / 10;
}

// Différentiel (indicatif), toujours exprimé en équivalent 18 trous pour rester
// comparable à l'index et aux parties 18 trous.
//
// 9 trous : méthode ffgolf de conversion d'une carte 9 trous — on ajoute au SBA des 9
// trous joués un SBA fictif des 9 non joués égal à leur par net + 1 (par + coups qu'aurait
// reçus le joueur avec son handicap de jeu 18 trous, + 1), puis on applique la formule
// 18 trous avec le slope/CR 18 trous.
//
// `ref18` décrit le 18 trous de référence : { slope, sss, par, unplayed: [{ par, hcp }] }
// (hcp = index 18 trous des trous non joués). Absent (parcours de 9 trous, partie
// restaurée d'un CSV, slope/CR 18 trous inconnu) : les mêmes 9 trous comptés deux fois,
// slope et CR doublés, les 9 « non joués » recevant les coups restants du handicap de jeu
// 18 trous.
//
// `index` : index du joueur au moment de la partie ; à défaut, retrouvé depuis `ph`.
export function differentiel({ holes, ph, rating, index, ref18 }) {
  if (!rating) return null;
  const sba = totalScoreAjuste(holes, ph);
  if (holes.length !== 9) return arrondi1(((sba - rating.sss) * 113) / rating.slope);

  const par9 = holes.reduce((s, h) => s + h.par, 0);
  const idx = index ?? indexDepuisHandicapJeu(ph, rating.slope, rating.sss, par9);
  let ref = ref18;
  let unplayedPar;
  let unplayedStrokes;
  if (ref) {
    const ph18 = handicapJeu(idx, ref.slope, ref.sss, ref.par);
    unplayedPar = ref.unplayed.reduce((s, h) => s + h.par, 0);
    unplayedStrokes = ref.unplayed.reduce((s, h) => s + strokesRecu(h.hcp, ph18, 18), 0);
  } else {
    ref = { slope: rating.slope * 2, sss: rating.sss * 2, par: par9 * 2 };
    const ph18 = handicapJeu(idx, ref.slope, ref.sss, ref.par);
    unplayedPar = par9;
    unplayedStrokes = ph18 - ph;
  }
  const sbaTotal = sba + unplayedPar + unplayedStrokes + 1;
  return arrondi1(((sbaTotal - ref.sss) * 113) / ref.slope);
}
