# BINÔME STUDIO

**Pauline & Math**<br>
Pâtisserie · Chocolaterie · Glacerie<br>
*Deux savoir-faire. Une même passion.*

Application web de travail partagé pour l’atelier. La racine de ce dépôt est le projet Next.js et constitue la source de vérité pour les développements futurs.

## Stack

- Next.js App Router, React et TypeScript
- Supabase Auth et accès aux tables `recipes` et `ingredients`
- Manifeste et service worker PWA

## Prérequis

- Node.js 20.9 ou supérieur
- npm fourni avec Node.js

## Installation et commandes

Depuis la racine du dépôt :

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Renseigner ensuite les variables Supabase dans `.env.local` et ouvrir http://localhost:3000.

Vérifications disponibles :

```powershell
npm run typecheck
npm run build
npm start
```

Le fichier `package-lock.json` est la référence des versions exactes à installer avec `npm ci`.

## Variables Supabase

Le fichier `.env.example` indique les deux noms de variables attendues : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Utiliser uniquement la clé publique anon/publishable côté client. Ne jamais placer une clé `service_role` dans une variable `NEXT_PUBLIC_*` ni la committer.

## État fonctionnel

L’authentification, la consultation et la création de recettes et de matières premières sont présentes dans l’interface. Le calculateur reste une démonstration locale; les fiches techniques et la production sont des écrans de structure. Les relations recette–matière première, les sous-recettes et le calcul HTVA/TVAC restent à développer.

## Supabase et sécurité des données

`supabase/schema.sql` est un modèle de démarrage uniquement. Il n'est ni une migration, ni une description vérifiée de la base actuellement utilisée. Ne pas l'exécuter sur le projet Supabase existant. Son inclusion dans le dépôt ne demande aucune modification de la base. Toute évolution devra commencer par une vérification en lecture seule du schéma et des politiques RLS, puis suivre une procédure de migration approuvée avec sauvegarde.

## Vercel

La configuration attendue pour les prochains déploiements de prévisualisation est la racine du dépôt (`.`), l’installation par `npm ci` et la compilation par `npm run build`, avec Node.js 22. Ces paramètres doivent être vérifiés dans le tableau de bord avant toute modification. La production reste rattachée à `main`.

## Dossiers de préparation locale

`binome-travail/` contient l’extraction d’origine de l’archive. Elle est conservée sans modification pour traçabilité, mais ignorée par Git; la copie `binome-travail-backup-*/` sert de sauvegarde locale. Le projet à utiliser est celui de la racine du dépôt.
