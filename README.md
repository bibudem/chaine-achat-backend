
# Backend – API Gestion d'Achats

API REST pour gérer les demandes d'achats et les abonnements des bibliothèques.

Ce dépôt contient uniquement le **backend** (Node.js / Express).  
Le frontend (Angular) se trouve dans un dépôt séparé.

## Fonctionnalités

- Créer et modifier des demandes d'achat
- Lister toutes les demandes (avec filtres par type, statut, date)
- Générer des rapports
- Gérer les informations de budget
- Import en lot depuis un fichier Excel, avec journal des imports
- Gestion des pièces jointes (ajout, téléchargement, suppression)
- Notifications automatiques par courriel via n8n
- Décision ACQ (approbation/refus) directement via un lien courriel
- Authentification et accès sécurisé

## Prérequis

- **Node.js** (version 18 ou plus)
- **npm**
- **PostgreSQL** (version 12 ou plus)

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/bibudem/chaine-achat-backend.git
cd chaine-achat-backend
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement (secrets)

Crée un fichier `.env` à la racine du projet :

```env
# Secrets (ne jamais committer)
AZURE_CLIENT_SECRET=votre_secret_azure
JWT_SECRET=remplacez_moi

# DATABASE (local)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_NAME=chaineAchat

# Server
NODE_ENV=development
PORT=3000

# N8N
N8N_BASE_URL=http://host.docker.internal:5678
```

Remplace :

- `votre_mot_de_passe` par le mot de passe PostgreSQL
- `DB_HOST` si ta base n'est pas en local
- `PORT` si tu veux changer le port par défaut
- `AZURE_CLIENT_SECRET` par le secret client de l'application Azure AD (authentification)
- `JWT_SECRET` par une valeur secrète pour les tokens
- `N8N_BASE_URL` par l'URL de ton instance n8n locale (webhooks de notification)

### 4. Configurer Azure AD et n8n (non sensible)

Copie le gabarit `config/config.example.js` vers `config/config.dev.js` (ce fichier est gitignoré) :

```bash
cp config/config.example.js config/config.dev.js
```

Remplis `azure.tenantId` et `azure.clientId` avec les identifiants de l'application Azure AD (non secrets — le secret reste dans `.env`). Les chemins des webhooks n8n (`n8n.suggestionUrl`, etc.) et `urls.frontend` ont déjà des valeurs par défaut, à ajuster au besoin.

En production, le même gabarit sert de base à `config/config.prod.js`, bundlé dans `function.zip` au déploiement (voir `pack.js`). Les secrets (`AZURE_CLIENT_SECRET`, `JWT_SECRET`, `N8N_BASE_URL`) restent injectés comme variables d'environnement sur AWS Lambda, jamais dans ce fichier.

### 5. Créer la base de données

Dans PostgreSQL :

```sql
CREATE DATABASE chaineAchat;
```

Ensuite, exécute le script SQL fourni (si tu en as un) pour créer les tables.

### 6. Démarrer l’API

```bash
node server.js
# ou, si tu utilises nodemon :
npm run dev
```

Le serveur démarre par défaut sur : `http://localhost:3000`

## Structure du projet

```text
chaine-achat-backend/
├── server.js               # Point d’entrée de l’application
├── routes/                 # Définition des endpoints
├── controllers/            # Logique métier des endpoints
├── models/                 # Accès à la base de données
├── config/
│   ├── config.js            # Assemble azure/n8n/jwt/urls à partir de .env + config.{dev,prod}.js
│   ├── config.example.js    # Gabarit committé, sans secrets
│   ├── config.dev.js        # Valeurs non sensibles de dev (gitignoré)
│   ├── config.prod.js       # Valeurs non sensibles de prod, bundlé dans function.zip (gitignoré)
│   └── postgres.config.js   # Connexion PostgreSQL
├── package.json            # Dépendances backend
├── .env                     # Secrets (DB, JWT, Azure, N8N) — non versionné
└── README.md
```

## Aide et dépannage

### Le backend ne démarre pas

- Vérifie que PostgreSQL est lancé
- Vérifie que le port choisi n'est pas déjà utilisé
- Vérifie les identifiants dans le fichier `.env`
- Vérifie que `config/config.dev.js` existe (sinon : `cp config/config.example.js config/config.dev.js`) — un avertissement dans la console l'indique s'il manque
- Vérifie que toutes les dépendances sont installées : `npm install`

### La connexion Azure AD ou les notifications n8n ne fonctionnent pas

- Vérifie `AZURE_CLIENT_SECRET` et `N8N_BASE_URL` dans `.env`
- Vérifie `azure.tenantId`, `azure.clientId` et `azure.redirectUri` dans `config/config.dev.js`
- En production, ces mêmes variables sont dans `config/config.prod.js` (chemins n8n) et injectées comme variables d'environnement Lambda (secrets)

### La base de données ne se connecte pas

- Vérifie que la base `chaineAchat` existe
- Vérifie `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` et `DB_NAME` dans `.env`
- Vérifie que PostgreSQL accepte les connexions sur le bon port

### Le frontend n’arrive pas à joindre l’API

- Vérifie que le backend est bien démarré sur `http://localhost:3000` (ou autre)
- Vérifie la configuration `apiUrl` côté frontend
- Vérifie les règles CORS si elles sont configurées

## À propos

**API Gestion d'Achats – Backend** – Version 1.0  
Développée par Natalia Jabinschi  

© 2026 Bibudem – Tous droits réservés