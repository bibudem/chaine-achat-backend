if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch { /* non disponible hors dev */ }
}
const express = require('express');
const helmet = require('helmet');
const { publicError } = require('./util/errors');
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

const authRoutes            = loadModule('./routes/auth',            'Routes auth');
const itemsRoutes           = loadModule('./routes/items',           'Routes items');
const rapportsRoutes        = loadModule('./routes/rapports',        'Routes rapports');
const reponsesRoutes        = loadModule('./routes/reponses',        'Routes réponses');
const homeRoutes            = loadModule('./routes/home',            'Routes home');
const importRoutes          = loadModule('./routes/imports',         'Routes import');
const importLogsRoutes      = loadModule('./routes/import-logs',     'Routes import-logs');
const configRoutes          = loadModule('./routes/config',          'Routes config');
const validationMiddleware  = loadModule('./middleware/validation.middleware', 'Middleware validation');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MIDDLEWARES GLOBAUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// Lambda 1 niveau de proxy
app.set('trust proxy', 1);
// En-têtes de sécurité HTTP (CSP désactivée : API JSON pure, ne sert aucune page HTML).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} — ${req.method} ${req.path}`);
  next();
});

// CORS
// Liste blanche : le vrai domaine de prod + localhost:4200 (serveur de dev Angular par
// défaut) — localhost:4200 doit toujours pouvoir appeler l'API, qu'on pointe vers un backend
// local ou directement vers la prod pour tester avec de vraies données. CORS_ORIGIN, si défini
// (liste séparée par des virgules), remplace entièrement cette liste.
const DEFAULT_ALLOWED_ORIGINS = ['https://achats.bib.umontreal.ca', 'http://localhost:4200', 'http://127.0.0.1:4200'];
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : DEFAULT_ALLOWED_ORIGINS;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (process.env.NODE_ENV !== 'production') {
    // Hors production : on reste permissif (outils comme Postman, autres ports locaux, etc.)
    // pour ne jamais gêner le travail local, même depuis une origine non listée.
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting (optionnel)
if (validationMiddleware?.apiLimiter) {
  app.use('/', validationMiddleware.apiLimiter);
  //console.log('Rate limiting activé');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use('/auth',            authRoutes);
app.use('/items',           itemsRoutes);
app.use('/rapports',        rapportsRoutes);
app.use('/reponses',        reponsesRoutes);
app.use('/import',       importRoutes);
app.use('/import-logs',  importLogsRoutes);
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
  const status = {
    status: 'OK',
    env: process.env.NODE_ENV || 'development',
    message: 'REST Gestion des achats',
    timestamp: new Date().toISOString()
  };
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
    error: publicError(err),
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