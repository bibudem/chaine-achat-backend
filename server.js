require('dotenv').config();
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const app = express();
const port = process.env.PORT || 3000;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CHARGEMENT DES MODULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function loadModule(path, label, { required = true } = {}) {
  try {
    const mod = require(path);
    console.log(`${label} chargé`);
    return mod;
  } catch (e) {
    if (required) {
      console.error(`❌ Erreur chargement ${label}:`, e.message);
      process.exit(1);
    }
    console.warn(`${label} non chargé (optionnel):`, e.message);
    return null;
  }
}

const itemsRoutes           = loadModule('./routes/items',           'Routes items');
const rapportsRoutes        = loadModule('./routes/rapports',        'Routes rapports');
const reponsesRoutes        = loadModule('./routes/reponses',        'Routes réponses');
const lstFournisseursRoutes = loadModule('./routes/lstFournisseurs', 'Routes fournisseurs');
const homeRoutes            = loadModule('./routes/home',            'Routes home');
const importRoutes          = loadModule('./routes/imports',         'Routes import');
const configRoutes          = loadModule('./routes/config',          'Routes config');
const validationMiddleware  = loadModule('./middleware/validation.middleware', 'Middleware validation');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MIDDLEWARES GLOBAUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.set('trust proxy', false);
app.use(express.json());

// Logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} — ${req.method} ${req.path}`);
  next();
});

// CORS
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Rate limiting (optionnel)
if (validationMiddleware?.apiLimiter) {
  app.use('/', validationMiddleware.apiLimiter);
  console.log('Rate limiting activé');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use('/items',           itemsRoutes);
app.use('/rapports',        rapportsRoutes);
app.use('/reponses',        reponsesRoutes);
app.use('/lst-fournisseurs', lstFournisseursRoutes);
app.use('/import', importRoutes);
app.use('/home',   homeRoutes);
app.use('/config', configRoutes);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTE RACINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.get('/', (_req, res) => {
  res.json({
    projet: 'Chaîne d\'achat — Bibliothèques UdeM',
    description: 'API de gestion des demandes d\'achat documentaire',
    version: require('./package.json').version,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTE DE SANTÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'Serveur en fonctionnement',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GESTION DES ERREURS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route introuvable' });
});

// Erreur globale
app.use((err, _req, res, _next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Erreur serveur interne',
    timestamp: new Date().toISOString()
  });
});

// Middleware d'erreur personnalisé (si défini)
if (validationMiddleware?.errorHandler) {
  app.use(validationMiddleware.errorHandler);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DÉMARRAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.listen(port, () => {
  console.log(`\n🚀 Serveur démarré sur le port ${port}`);
  console.log(`   Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   URL           : http://localhost:${port}`);
  console.log(`   Health check  : http://localhost:${port}/health\n`);
});