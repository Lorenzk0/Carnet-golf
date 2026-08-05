# CLAUDE.md

Stack : React 19 + Vite + Tailwind v4, Supabase (Postgres + Auth + RLS), PWA (vite-plugin-pwa), déployé sur Vercel via l'intégration GitHub.

## Commandes

```
npm run dev       # serveur de dev Vite
npm run build     # build de prod
npm run lint      # oxlint (pas d'ESLint)
npm run preview   # sert le build de prod en local
```

Pas de suite de tests dans le repo (aucun fichier `*.test.*`/`*.spec.*`, pas de config Playwright) malgré des mentions de "vérification Playwright" dans les descriptions de PR passées — ces vérifications sont faites ad hoc, pas committées. Ne pas supposer qu'une commande `test` existe.

Pas de CI (`.github/workflows` absent) : le build/lint est à lancer manuellement avant de pousser.

## Secrets

- `.env.local` (gitignoré) avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` — clé anon/publique uniquement, jamais de `service_role`. Template dans `.env.example`.
- Aucun autre secret dans le repo. Config Vercel (`.vercel/`) et fichiers `.env*` sont gitignorés.

## Supabase — tables (`supabase/schema.sql`)

- `courses` / `holes` : parcours partagés (`owner_id null`, modifiables par tout utilisateur authentifié — usage privé entre quelques personnes, pas de restriction au créateur) + parcours privés (`owner_id = auth.uid()`).
- `user_settings` : une ligne par utilisateur (clubs perso, corrections par/hcp et slope/CR, index handicap) — entièrement privé.
- `rounds` : une partie jouée, privée à son propriétaire. `holes` (jsonb) fige le détail par trou tel que joué au moment de la partie — modifier un parcours plus tard ne change pas les parties déjà enregistrées.
- `shots` : chaque coup d'une partie, droits hérités de `rounds` via `round_id`.
- Vue `leaderboard` + fonction `leaderboard_filtered(p_from, p_to)` (`security definer`) : seuls les agrégats par joueur sont exposés cross-utilisateur, jamais les parties/coups bruts d'autrui.

Pas d'outil de migration : `schema.sql` est la source de vérité pour une install neuve (idempotent, `create table if not exists`). Les autres fichiers `supabase/*.sql` sont des scripts additifs à coller à la main dans Supabase > SQL Editor — en ajouter un ne suffit pas, il faut aussi répercuter le changement dans `schema.sql`.

## Déploiement

Vercel connecté au repo GitHub (projet `carnet-golf`, équipe `lorenzk0s-projects`) : preview automatique par branche/PR. Branche de production et URL de prod à vérifier dans le dashboard Vercel — pas stockées dans le repo (pas de `vercel.json`).

## Conventions de commit

- Commits individuels : message en **anglais**, impératif, sans préfixe type conventional-commits (ex. `Fix handicap de jeu formula: 9 holes don't need index/2`).
- Titres/descriptions de PR : en **français**, avec sections `## Résumé` / `## Changements` / `## Vérifications effectuées`.
