
# Backend – API Gestion d'Achats

API REST pour gérer les demandes d'achats et les abonnements des bibliothèques.

Ce dépôt contient uniquement le **backend** (Node.js / Express).  
Le frontend (Angular) se trouve dans un dépôt séparé.

## Fonctionnalités

- Créer et modifier des demandes d'achat
- Lister toutes les demandes (avec filtres par type, statut, date)
- Générer des rapports
- Gérer les informations de budget
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

### 3. Configurer la base de données

Crée un fichier `.env` à la racine du projet :

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_NAME=chaineAchat

# Optionnel
PORT=3000
JWT_SECRET=remplacez_moi
```

Remplace :

- `votre_mot_de_passe` par le mot de passe PostgreSQL
- `DB_HOST` si ta base n'est pas en local
- `PORT` si tu veux changer le port par défaut
- `JWT_SECRET` par une valeur secrète pour les tokens

### 4. Créer la base de données

Dans PostgreSQL :

```sql
CREATE DATABASE chaineAchat;
```

Ensuite, exécute le script SQL fourni (si tu en as un) pour créer les tables.

### 5. Démarrer l’API

```bash
node server.js
# ou, si tu utilises nodemon :
npm run dev
```

Le serveur démarre par défaut sur : `http://localhost:3000`

## Structure du projet

```text
app-gestion-achats-backend/
├── server.js        # Point d’entrée de l’application
├── routes/          # Définition des endpoints
├── controllers/     # Logique métier des endpoints
├── models/          # Accès à la base de données
├── config/          # Configuration (DB, etc.)
├── package.json     # Dépendances backend
├── .env.example     # Exemple de configuration d’environnement (optionnel)
└── README.md
```

## Aide et dépannage

### Le backend ne démarre pas

- Vérifie que PostgreSQL est lancé
- Vérifie que le port choisi n'est pas déjà utilisé
- Vérifie les identifiants dans le fichier `.env`
- Vérifie que toutes les dépendances sont installées : `npm install`

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