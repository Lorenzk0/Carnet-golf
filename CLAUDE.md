# CLAUDE.md

Stack : React 19 + Vite + Tailwind v4, Supabase (Postgres + Auth + RLS), PWA (vite-plugin-pwa), déployé sur Vercel via l'intégration GitHub.

## Commandes

```
npm run dev       # serveur de dev Vite
npm run build     # build de prod
npm run lint      # oxlint (pas d'ESLint)
npm test          # tests des calculs de score (node --test, src/**/*.test.js)
npm run preview   # sert le build de prod en local
```

Tests : seuls les calculs de score purs (`src/lib/scoring.js` : coups rendus, score ajusté, différentiel) sont testés, avec le runner intégré de Node (`src/lib/scoring.test.js`, aucune dépendance). Pas de test d'interface ; les "vérifications Playwright" mentionnées dans d'anciennes PR étaient faites ad hoc, pas committées.

Documentation des calculs : `src/docs/calculs.md` (formules de toutes les stats affichées), rendue telle quelle dans l'app par `src/CalculsScreen.jsx` (« Comment c'est calculé ? »). Toute modification d'un calcul de stat doit être répercutée dans ce fichier.

Version : `package.json` > `version`, affichée en bas de l'accueil pour vérifier qu'une mise en prod a bien pris (cache PWA). L'incrémenter dans chaque PR destinée à `main` (mineure pour une fonctionnalité, patch pour un correctif).

Pas de CI (`.github/workflows` absent) : le build/lint est à lancer manuellement avant de pousser.

## Secrets

- `.env.local` (gitignoré) avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` — clé anon/publique uniquement, jamais de `service_role`. Template dans `.env.example`.
- Aucun autre secret dans le repo. Config Vercel (`.vercel/`) et fichiers `.env*` sont gitignorés.

## Supabase — tables (`supabase/schema.sql`)

- `courses` / `holes` : parcours partagés (`owner_id null`, modifiables par tout utilisateur authentifié — usage privé entre quelques personnes, pas de restriction au créateur) + parcours privés (`owner_id = auth.uid()`).
- `user_settings` : une ligne par utilisateur (clubs perso, corrections par/hcp et slope/CR, index handicap) — entièrement privé.
- `rounds` : une partie jouée, privée à son propriétaire. `holes` (jsonb) fige le détail par trou tel que joué au moment de la partie — modifier un parcours plus tard ne change pas les parties déjà enregistrées. `rating` (jsonb) contient le slope/CR du départ joué et, depuis l'ajout du différentiel 9 trous converti en 18, l'`index` utilisé et, pour un 9 trous joué sur un 18, `ref18` (slope/CR 18 trous + par/index des 9 trous non joués) — tous deux optionnels, reconstitués à défaut pour les anciennes parties.
- `shots` : chaque coup d'une partie, droits hérités de `rounds` via `round_id`.
- Vue `leaderboard` + fonction `leaderboard_filtered(p_from, p_to)` (`security definer`) : seuls les agrégats par joueur sont exposés cross-utilisateur, jamais les parties/coups bruts d'autrui.

Pas d'outil de migration : `schema.sql` est la source de vérité pour une install neuve (idempotent, `create table if not exists`). Les autres fichiers `supabase/*.sql` sont des scripts additifs à coller à la main dans Supabase > SQL Editor — en ajouter un ne suffit pas, il faut aussi répercuter le changement dans `schema.sql`.

## Déploiement

Vercel connecté au repo GitHub (projet `carnet-golf`, équipe `lorenzk0s-projects`) : preview automatique par branche/PR. Branche de production : `main`. URL de prod : `carnet-golf.vercel.app`. Pas de `vercel.json` dans le repo.

## Conventions de commit

- Commits individuels : message en **français**, impératif, sans préfixe type conventional-commits (ex. `Corrige la formule du handicap de jeu : pas de division par 2 sur 9 trous`).
- Titres/descriptions de PR : en **français**, avec sections `## Résumé` / `## Changements` / `## Vérifications effectuées`.
