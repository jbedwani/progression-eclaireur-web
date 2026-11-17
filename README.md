
# Progression Éclaireurs

Application de suivi de la progression des Éclaireurs du 266e groupe scout de la Pointe-de-l’Île.

## Fonctionnalités

- Consultation des dossiers individuels selon les droits d'accès.
- Suivi des Labels, Repères et Brevets.
- Gestion des jeunes et des patrouilles selon les autorisations.
- Historique de progression.

## Technologies

- React
- TypeScript
- Vite
- Supabase

## Développement local

Prérequis : Node.js et npm.

```bash
npm install
```

Créer un fichier `.env.local` avec les variables de configuration Supabase :

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Démarrer le serveur :

```bash
npm run dev
```

Compiler l'application :

```bash
npm run build
```

## Déploiement

Le frontend est conçu pour être hébergé sur Cloudflare Pages.

Répertoire de sortie : `dist`
Commande de compilation : `npm run build`
