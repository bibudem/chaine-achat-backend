require('dotenv').config();
const express = require('express');

console.log('Démarrage du serveur...');

/* ---------------------- IMPORTS ----------------------- */
let itemsRoutes, homeRoutes, validationMiddleware, rapportsRoutes;

try {
  itemsRoutes = require('./routes/items');
  console.log('Routes items chargées');
} catch (e) {
  console.error('❌ Erreur chargement routes items:', e.message);
  process.exit(1);
}

try {
  homeRoutes = require('./routes/home');
  console.log('Routes home chargées (optionnel)');
} catch (e) {
  console.warn('⚠️ Routes home non chargées (optionnel):', e.message);
}

try {
  validationMiddleware = require('./middleware/validation.middleware');
  console.log('Middleware de validation chargé');
} catch (e) {
  console.error('❌ Erreur chargement middleware:', e.message);
  process.exit(1);
}

try {
  rapportsRoutes = require('./routes/rapports');
  console.log('Routes rapports chargées');
} catch (e) {
  console.error('❌ Erreur chargement routes rapports:', e.message);
  process.exit(1);
}

/* ---------------------- INITIALISATION ----------------------- */
const app = express();
const port = process.env.PORT || 9111;

/* ---------------------- MIDDLEWARES ----------------------- */
app.use(express.json());

// Logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  next();
});

// Trust proxy
app.set('trust proxy', true);

// Rate limiting si présent
if (validationMiddleware?.apiLimiter) {
  app.use('/', validationMiddleware.apiLimiter);
  console.log('Rate limiting activé');
}

/* ---------------------- ROUTES ----------------------- */
app.use('/items', itemsRoutes);
if (homeRoutes) app.use('/home', homeRoutes);
app.use('/rapports', rapportsRoutes);

/* ---------------------- ROUTE DE SANTÉ ----------------------- */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Serveur en fonctionnement',
    timestamp: new Date().toISOString()
  });
});

/* ---------------------- GESTION DES ERREURS ----------------------- */
if (validationMiddleware?.errorHandler) {
  app.use(validationMiddleware.errorHandler);
  console.log('Gestionnaire d\'erreurs activé');
}

/* ---------------------- DÉMARRAGE DU SERVEUR ----------------------- */
app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`URL: http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});
