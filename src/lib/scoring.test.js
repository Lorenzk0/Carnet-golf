import { test } from "node:test";
import assert from "node:assert/strict";
import { strokesParTrou, stableford, totalScoreAjuste, handicapJeu, differentiel, hcpRanks } from "./scoring.js";

// Trou avec un score brut donné (les coups suffisent : holeStrokes = coups + pénalités + putts).
const trou = (numero, par, hcp, brut) => ({ numero, par, hcp, shots: Array.from({ length: brut }, () => ({})), putts: null });
const points = (holes, ph) => {
  const rendus = strokesParTrou(holes, ph);
  return holes.reduce((s, h, i) => s + stableford(h.shots.length - rendus[i], h.par), 0);
};

// Évreux, aller (trous 1-9 d'un 18 trous, index 18 trous), départs bleus, 4 octobre 2026.
const evreuxAller = [
  trou(1, 4, 6, 8), trou(2, 5, 11, 6), trou(3, 4, 12, 6), trou(4, 4, 4, 7), trou(5, 3, 16, 7),
  trou(6, 5, 13, 10), trou(7, 3, 15, 7), trou(8, 4, 5, 6), trou(9, 4, 1, 6),
];
const evreuxRetour = [[4, 17], [4, 18], [5, 9], [3, 7], [4, 3], [5, 14], [3, 8], [4, 10], [4, 2]].map(([par, hcp]) => ({ par, hcp }));
const evreuxRating = { slope: 60, sss: 34.4 };
const evreuxRef18 = { slope: 119, sss: 67.6, par: 72, unplayed: evreuxRetour };

test("Évreux 9 trous : handicap de jeu 22", () => {
  assert.equal(handicapJeu(44, 60, 34.4, 36), 22);
});

test("Évreux 9 trous : 22 coups répartis sur les 9 trous joués, index reclassés", () => {
  assert.deepEqual(strokesParTrou(evreuxAller, 22), [3, 2, 2, 3, 2, 2, 2, 3, 3]);
  assert.equal(points(evreuxAller, 22), 14);
  assert.equal(totalScoreAjuste(evreuxAller, 22), 62);
});

test("Évreux 9 trous : différentiel converti en 18 trous (par net + 1 sur le retour)", () => {
  // Hcp de jeu 18 trous = 42 -> 20 coups sur le retour ; SBA fictif 36 + 20 + 1 = 57 ;
  // (62 + 57 - 67,6) × 113 / 119 = 48,8.
  assert.equal(differentiel({ holes: evreuxAller, ph: 22, rating: evreuxRating, index: 44, ref18: evreuxRef18 }), 48.8);
  // Index non conservé (parties anciennes) : retrouvé depuis le handicap de jeu.
  assert.equal(differentiel({ holes: evreuxAller, ph: 22, rating: evreuxRating, ref18: evreuxRef18 }), 48.8);
});

test("Exemple ffgolf : SBA aller 49, par 36 et 11 coups sur le retour -> SBA 18 trous 97", () => {
  // Retour fictif : 11 coups reçus avec un handicap de jeu 18 trous de 21 (index impairs
  // sur le retour : 1, 3, …, 17 -> 1 coup partout + 1 de plus sur les index 1 et 3 = 11).
  const retour = [1, 3, 5, 7, 9, 11, 13, 15, 17].map((hcp) => ({ par: 4, hcp }));
  const aller = [2, 4, 6, 8, 10, 12, 14, 16, 18].map((hcp, i) => trou(i + 1, 4, hcp, i < 4 ? 6 : 5));
  // SBA aller = 4×6 + 5×5 = 49 (aucun plafond atteint avec 10-11 coups sur 9 trous).
  assert.equal(totalScoreAjuste(aller, 10), 49);
  const ref18 = { slope: 113, sss: 72, par: 72, unplayed: retour };
  // Index 21 sur un départ neutre -> hcp de jeu 18 trous 21 ; SBA 97 -> différentiel 25.
  assert.equal(differentiel({ holes: aller, ph: 10, rating: { slope: 113, sss: 36 }, index: 21, ref18 }), 25);
});

test("Gonesse 9 trous : handicap de jeu 17 (index 35, slope 62, CR 33,8, par 36)", () => {
  assert.equal(handicapJeu(35, 62, 33.8, 36), 17);
});

test("Parcours de 9 trous : mêmes 9 trous comptés deux fois, slope et CR doublés", () => {
  // Gonesse (index 1-9) : SBA 55 joué, 17 coups sur les 9 « non joués », par 36.
  const gonesse = [
    trou(1, 4, 4, 7), trou(2, 4, 3, 7), trou(3, 3, 7, 5), trou(4, 5, 2, 7), trou(5, 4, 6, 6),
    trou(6, 4, 1, 6), trou(7, 4, 5, 6), trou(8, 3, 8, 5), trou(9, 5, 9, 6),
  ];
  assert.equal(totalScoreAjuste(gonesse, 17), 55);
  // (55 + 36 + 17 + 1 - 67,6) × 113 / 124 = 37,7
  assert.equal(differentiel({ holes: gonesse, ph: 17, rating: { slope: 62, sss: 33.8 }, index: 35 }), 37.7);
});

test("18 trous, handicap de jeu > 36 : 3 coups sur les index 1 à 4, 2 ailleurs", () => {
  const holes = Array.from({ length: 18 }, (_, i) => trou(i + 1, 4, ((i * 7) % 18) + 1, 6));
  const rendus = strokesParTrou(holes, 40);
  holes.forEach((h, i) => assert.equal(rendus[i], h.hcp <= 4 ? 3 : 2));
  assert.equal(rendus.reduce((s, x) => s + x, 0), 40);
});

test("18 trous complet : différentiel inchangé (formule 18 trous directe)", () => {
  const holes = Array.from({ length: 18 }, (_, i) => trou(i + 1, 4, i + 1, 5));
  assert.equal(differentiel({ holes, ph: 18, rating: { slope: 113, sss: 72 } }), 18);
});

test("9 trous, handicap de jeu ≤ 9 : 1 coup sur les trous les plus difficiles seulement", () => {
  // Index 1, 4, 5, 6, 11 -> trous 9, 4, 8, 1, 2.
  assert.deepEqual(strokesParTrou(evreuxAller, 5), [1, 1, 0, 1, 0, 0, 0, 1, 1]);
});

test("Handicap de jeu négatif : coups rendus au parcours sur les trous les plus faciles", () => {
  assert.deepEqual(strokesParTrou(evreuxAller, -2), [0, 0, 0, 0, -1, 0, -1, 0, 0]);
});

test("Reclassement : égalités départagées par l'ordre des trous", () => {
  assert.deepEqual(hcpRanks([{ hcp: 5 }, { hcp: 1 }, { hcp: 5 }]), [2, 1, 3]);
});
