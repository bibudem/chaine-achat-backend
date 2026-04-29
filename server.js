if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch { /* non disponible hors dev */ }
}
const express = require('express');
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
const homeRoutes            = loadModule('./routes/home',            'Routes home');
const importRoutes          = loadModule('./routes/imports',         'Routes import');
const configRoutes          = loadModule('./routes/config',          'Routes config');
const validationMiddleware  = loadModule('./middleware/validation.middleware', 'Middleware validation');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MIDDLEWARES GLOBAUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// Lambda 1 niveau de proxy
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} — ${req.method} ${req.path}`);
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
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
app.get('/health', async (_req, res) => {
  const status = { status: 'OK', env: process.env.NODE_ENV || 'development', timestamp: new Date().toISOString() };
  try {
    const pool = require('./config/postgres.config');
    await pool.query('SELECT 1');
    status.db = 'OK';
  } catch (e) {
    status.db = 'ERREUR';
    status.status = 'DEGRADED';
  }
  res.status(status.status === 'OK' ? 200 : 503).json(status);
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
   DÉMARRAGE — local ou Lambda
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`\nServeur démarré sur le port ${port}`);
    console.log(`   Environnement : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   URL           : http://localhost:${port}`);
    console.log(`   Health check  : http://localhost:${port}/health\n`);
  });
}

// Handler exporté pour AWS Lambda
module.exports.handler = require('serverless-http')(app);