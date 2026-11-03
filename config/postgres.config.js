const { Pool } = require('pg');

// Taille du pool : en Lambda, une instance traite une requête à la fois, mais il y a beaucoup
// d'instances — max:2 évite l'épuisement des connexions côté RDS. En local (serveur unique,
// requêtes simultanées), 2 connexions bloquaient les requêtes qui en utilisent une deuxième
// pendant qu'elles en tiennent une (ex. GET /items/fiche/:id). DB_POOL_MAX permet d'ajuster.
const EST_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const POOL_MAX   = parseInt(process.env.DB_POOL_MAX || (EST_LAMBDA ? '2' : '10'), 10);

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: POOL_MAX,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  // SSL requis par RDS en production, désactivé en local
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL inattendue:', err.message);
});

module.exports = pool;