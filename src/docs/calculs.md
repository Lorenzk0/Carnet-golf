# Comment les statistiques sont calculées

Ce document décrit précisément chaque chiffre affiché dans l'app : ce qu'il mesure, d'où viennent les données et la formule utilisée. Il est affiché tel quel dans l'app (bouton « Comment c'est calculé ? ») et versionné avec le code : si un calcul change, ce texte doit changer avec lui.

## Saisie : ce qu'il faut renseigner

- **Un coup** = un swing réellement joué (départ, fairway, rough, bunker, avant-green). Les putts se saisissent à part, en fin de trou.
- **Pénalité** : cocher la pénalité sur le coup fautif ajoute **1 coup fictif** au score, sans swing. Hors-limite et Eau la cochent automatiquement selon la zone d'arrivée.
- **Chip** : coup d'approche court et roulé. Automatique depuis l'avant-green, case à cocher depuis le fairway ou le rough.
- **Distance du chip** : distance **jusqu'au drapeau** (pas jusqu'au bord du green), estimée depuis l'endroit où se trouve la balle. Même référence que la distance du 1er putt, ce qui permet de comparer les deux.
- **Distance du 1er putt** : distance balle → trou au moment du premier putt.
- **Trou terminé** : un trou compte dans les statistiques dès que ses putts sont saisis (même 0 putt, pour une balle rentrée de l'extérieur du green).

## Score d'un trou

```
Score brut = nombre de coups joués + nombre de pénalités + nombre de putts
```

- **Écart au par** = score brut − par du trou (−1 birdie, 0 par, +1 bogey…).
- Catégories du graphique « Répartition des scores » : Eagle ou mieux (≤ −2), Birdie (−1), Par (0), Bogey (+1), Double (+2), Triple (+3), Quad+ (+4 et au-delà).

## Handicap de jeu (méthode WHS)

Nombre total de coups reçus pour la partie, calculé au démarrage à partir de l'index du joueur et du départ joué.

```
Handicap de jeu = arrondi( Index × Slope / 113 + (CR − Par) )
```

- **Slope** et **CR** (course rating, aussi appelé SSS) : ceux du départ joué (rouges, bleus, jaunes, blancs), propres à la configuration jouée (18 trous, aller, retour, 9 trous).
- **Par** : par total des trous joués.
- Arrondi à l'entier le plus proche, une demie s'arrondissant en s'éloignant de zéro (convention WHS).
- **Pas de division par 2 sur 9 trous** : le slope/CR d'un 9 trous sont déjà ceux de ces 9 trous ; diviser l'index en plus compterait le 9 trous deux fois.

Exemple (vérifié contre une carte officielle ffgolf) : index 35, Gonesse 9 trous, slope 62, CR 33,8, par 36 → 35 × 62 / 113 + (33,8 − 36) = 19,20 − 2,2 = 17,0 → **17 coups reçus**.

Le handicap de jeu est figé dans la partie. « Corriger depuis un index » sur le récap le recalcule avec un autre index.

## Coups reçus trou par trou

Le handicap de jeu est réparti sur les **trous joués**, du plus difficile au plus facile selon leur index (colonne « Hcp » de la carte).

```
base = partie entière de (Handicap de jeu / nombre de trous joués)
reste = Handicap de jeu − base × nombre de trous joués
Coups reçus sur un trou = base + 1 si son rang de difficulté ≤ reste, sinon base
```

- Le **rang de difficulté** va de 1 (index le plus bas parmi les trous joués) au nombre de trous joués. Sur un aller ou un retour d'un 18 trous, les index de la carte vont de 1 à 18 : ils sont reclassés de 1 à 9 parmi les 9 trous joués.
- Handicap de jeu négatif (joueur meilleur que scratch) : les coups sont rendus **au parcours** sur les trous les plus faciles.

Exemple : handicap de jeu 17 sur 9 trous → base 1, reste 8 → 2 coups reçus sur les 8 trous les plus difficiles, 1 coup sur le plus facile.

## Score net et Stableford

```
Score net d'un trou = score brut − coups reçus sur ce trou
Points Stableford = max(0 ; 2 − (score net − par))
```

| Score net par rapport au par | Points |
| --- | --- |
| Double bogey net ou pire | 0 |
| Bogey net | 1 |
| Par net | 2 |
| Birdie net | 3 |
| Eagle net | 4 |

Exemple : par 4, 2 coups reçus, 6 coups joués → net 4 = par net → **2 points**.

Le total Stableford du récap est la somme des points de tous les trous.

## Score ajusté (SBA)

Utilisé uniquement pour le différentiel. Chaque trou est plafonné au **double bogey net** pour qu'un trou catastrophique ne gonfle pas le différentiel :

```
Score ajusté d'un trou = min( score brut ; par + 2 + coups reçus sur ce trou )
SBA = somme des scores ajustés des trous joués
```

## Différentiel (indicatif)

Mesure la performance d'une partie sur l'échelle de l'index. Toujours exprimé en **équivalent 18 trous**, pour rester comparable à l'index. Arrondi à 0,1. Calculé seulement sur une partie entièrement saisie.

**Partie 18 trous :**

```
Différentiel = (SBA − CR) × 113 / Slope
```

Exemple : SBA 98, CR 70,4, slope 128 → (98 − 70,4) × 113 / 128 = **24,4**.

**Partie 9 trous** (méthode ffgolf de conversion d'une carte 9 trous) : on complète les 9 trous joués par un score fictif pour les 9 non joués, égal à leur **par net + 1**, puis on applique la formule 18 trous avec le slope/CR 18 trous.

```
Handicap de jeu 18 trous = calculé comme plus haut, avec l'index et le slope/CR/par du 18 trous
Coups reçus sur les 9 non joués = répartis selon leur index 18 trous
SBA 18 = SBA des 9 joués + par des 9 non joués + coups reçus sur les 9 non joués + 1
Différentiel = (SBA 18 − CR 18 trous) × 113 / Slope 18 trous
```

Exemple : SBA des 9 joués 50, par des 9 non joués 36, 9 coups reçus sur ces trous → SBA 18 = 50 + 36 + 9 + 1 = 96 ; avec CR 71,2 et slope 125 → (96 − 71,2) × 113 / 125 = **22,4**.

Cas particuliers :
- **Parcours de 9 trous seulement** (pas de 18 trous de référence), ou slope/CR 18 trous inconnus : les 9 trous joués servent de modèle pour les 9 non joués, avec slope et CR doublés.
- **Index utilisé** : celui de la partie, figé au démarrage. Pour les anciennes parties qui ne l'avaient pas conservé, il est retrouvé depuis le handicap de jeu (précis à ±0,5 coup).

Ce différentiel est **indicatif** : il dépend des slope/CR saisis dans l'app et ne remplace pas un différentiel validé par la ffgolf (qui applique aussi des ajustements de conditions de jeu, PCC).

## Tableau de bord — Vue d'ensemble

Toutes les statistiques respectent la période choisie en haut de page. Seuls les **trous terminés** (putts saisis) sont pris en compte, y compris ceux d'une partie en cours ou abandonnée.

- **Écart/trou moyen** = somme des écarts au par (brut) / nombre de trous terminés. Exemple : +18 sur 18 trous → +1,00/trou. Moyenne **par trou**, pas par partie : une partie de 18 trous pèse deux fois plus qu'une de 9.
- **Pts Stableford/trou** = somme des points Stableford / nombre de trous terminés. Repère : 2,00/trou = jouer exactement son handicap (36 points sur 18 trous). Contrairement à l'écart, cet indicateur tient compte du handicap et de la difficulté de chaque trou.
- **Meilleure partie / Partie la + difficile** : la partie avec le plus petit / le plus grand écart/trou (brut). Normalisé par trou, donc une partie partielle reste comparable.
- **Progression** : écart/trou et pts/trou de chaque partie, dans l'ordre chronologique.
- **Différentiel indicatif** : différentiel de chaque partie entièrement saisie (voir plus haut).
- **Par type de trou** : score brut moyen sur les par 3, par 4 et par 5, et son écart au par.

## Tableau de bord — Clubs

- **Note de contact /100** : chaque qualité de contact reçoit une valeur de 0 à 100 répartie régulièrement : Topé 0, Gratté 14, Socket 29, Pointe 43, Moyen 57, Correct 71, Bon 86, Pur 100. La note est la moyenne sur les coups du club où le contact est renseigné.
- **Sans gain/recul** = coups notés « Sans gain » ou « Recul » / coups joués avec ce club.
- **Traj.** : trajectoire la plus fréquente.
- **Zones de réception /100** : chaque zone d'arrivée a une valeur — Green 100, Fairway 85, Avant-green 70, Rough 40, Bunker 30, Eau 0, Hors-limite 0. La note est la moyenne sur les coups dont la zone d'arrivée est renseignée.

## Tableau de bord — Jeu

- **Réception des coups de départ** : répartition des zones d'arrivée de tous les coups joués depuis le départ (y compris sur les par 3), rough détaillé par côté.
- **Par zone de départ** : note de contact /100 (voir Clubs), part des coups « Avancé nettement » et part des coups « Sans gain / Recul », roughs gauche et droit regroupés.
- **Sorties de rough par côté** : part de coups sans gain ou en recul selon le côté du rough.

## Tableau de bord — Petit jeu

Ne concerne que les coups marqués « Chip ».

- **% green touché par zone de départ** = chips arrivés sur le green / chips joués depuis cette zone (fairway, rough, avant-green).
- **% green touché par distance du chip** : même calcul par tranche de distance au drapeau ; les chips sans distance renseignée sont exclus et comptés à part.
- **Clubs utilisés au chip** : nombre de chips et % de green touché par club.
- **Putts après un chip réussi** : seulement les chips arrivés sur le green **et** dernier coup avant les putts (les putts leur sont alors attribuables sans ambiguïté). Répartition en 1 putt, 2 putts, 3 putts et +.
- **Distance laissée au 1er putt après un chip réussi** : mêmes chips, répartis par distance du 1er putt, par zone de départ puis par club.

## Tableau de bord — Putting

- **Putts/trou** = total des putts / nombre de trous terminés.
- **1-putt** / **3-putts et +** : nombre de trous concernés.
- **Réussite selon la distance du 1er putt** : trous rentrés en 1 putt / trous avec cette distance de 1er putt.
- **Répartition des putts par distance** : pour chaque distance de 1er putt, nombre de trous en 1, 2, 3, 4+ putts. Trous sans distance renseignée exclus (comptés à part).

## Tableau de bord — Parcours

- **Écart/trou par parcours** = somme des écarts au par / trous terminés sur ce parcours.
- **Trous noirs** : trous joués au moins 2 fois sur un même parcours, classés par écart moyen au par (les 5 pires).

## Tableau de bord — Pénalités

- **Pénalités/partie** = nombre total de pénalités / nombre de parties ayant au moins un trou terminé.
- **Origine par zone de départ / par club** : zone et club du coup qui a pris la pénalité.

## Récap d'une partie

- **Score brut / net** et leur écart au par total ; **Stableford** : voir plus haut.
- **Fairways** = par 4 et par 5 dont le coup de départ arrive sur le fairway / nombre de par 4 et par 5.
- **GIR** (green en régulation) = trous terminés où le nombre de coups joués avant les putts est ≤ par − 2 / nombre de trous de la partie. Les pénalités ne sont **pas** comptées dans ce nombre de coups (seuls les swings le sont) : une balle droppée après une pénalité peut donc donner un GIR que la règle officielle ne compterait pas.
- **Scrambles** = trous **sans** GIR où le score brut (pénalités comprises) est quand même ≤ par.
- **Putts** : total de la partie.

## Classement

Comparaison entre joueurs sur la période choisie. Seuls ces agrégats sont partagés, jamais les parties ou les coups de quelqu'un.

- **Parties** : parties entièrement saisies.
- **Différentiel** : moyenne, sur les parties entièrement saisies, de (score brut − CR) × 113 / slope. **Attention : ce n'est pas le même calcul que le différentiel du récap et du tableau de bord** — il utilise le score brut (pas le score ajusté plafonné au double bogey net) et ne convertit pas les 9 trous en équivalent 18 trous (une partie 9 trous y donne un différentiel « 9 trous », environ deux fois plus petit). Il sert à comparer les joueurs entre eux, pas à se situer par rapport à son index.
- **Fairways** = par 4/5 avec coup de départ sur le fairway / par 4/5 terminés.
- **Greens** = trous en régulation (même définition que le GIR du récap) / trous terminés.
- **Putts** = putts moyens par trou terminé.
- **Scrambling** = trous sans GIR mais score brut ≤ par / trous sans GIR.
