# Carnet de golf

## Ce que fait l'app

Une PWA pour suivre ses parties de golf coup par coup : à chaque trou, on saisit zone de départ/d'arrivée, club, contact, pénalités, putts — pas juste le score. L'app calcule le handicap de jeu (méthode WHS) et le différentiel à partir de l'index du joueur et du slope/CR du départ, et restitue tout ça dans un tableau de bord (progression, fairways/greens en régulation, petit jeu, pénalités) ainsi qu'un classement comparant les stats agrégées entre les quelques joueurs qui l'utilisent. Utilisable hors-ligne (les écritures sont mises en file d'attente et resynchronisées au retour du réseau) et installable comme app mobile.

## Lancer en local

```bash
npm install
cp .env.example .env.local   # remplir avec les identifiants Supabase, voir ci-dessous
npm run dev
```

Autres commandes : `npm run build`, `npm run lint` (oxlint), `npm run preview`. Pas de suite de tests dans ce repo — voir `CLAUDE.md` pour le détail des conventions du projet.

L'authentification se fait par lien magique envoyé par email (pas de mot de passe) — il faut donc un compte Supabase Auth valide sur le projet pour se connecter, même en local.

## Où sont les données

Tout (parcours, parties, coups, réglages perso) vit dans une base Postgres Supabase — schéma complet et commenté dans `supabase/schema.sql`. Le repo ne contient **aucun identifiant** de projet Supabase réel (secret, jamais commité, voir `.env.example` pour le format attendu).

Pour y accéder :
- **Récupérer les credentials** (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) : demande-les au mainteneur actuel, ou regarde dans Vercel → projet `carnet-golf` → *Settings → Environment Variables* (c'est la config utilisée en production).
- **Éditer le schéma / requêter la base directement** : dashboard Supabase du projet correspondant → *SQL Editor* (pas d'outil de migration : `schema.sql` fait foi pour une install neuve, les autres `supabase/*.sql` sont des scripts additifs à coller à la main).
- **Voir/gérer les utilisateurs** : dashboard Supabase → *Authentication*.

## Déploiement

Hébergé sur Vercel, connecté au repo GitHub (déploiement automatique sur push).

- Production : https://carnet-golf.vercel.app
- Dashboard Vercel : https://vercel.com/lorenzk0s-projects/carnet-golf (projet `carnet-golf`, équipe `lorenzk0s-projects`)
- Chaque branche/PR obtient aussi un déploiement preview automatique.
