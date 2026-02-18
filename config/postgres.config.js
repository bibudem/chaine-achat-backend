const { Pool } = require('pg');

// Configuration PostgreSQL depuis les variables d'environnement
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chaineAchat',
  max: 20, // nombre maximum de clients dans le pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Vérification de la connexion
pool.on('connect', () => {
  console.log('✅ Connexion PostgreSQL établie');
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL:', err);
});

// Test de connexion au démarrage
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Échec de connexion à PostgreSQL:', err.message);
  } else {
    console.log('PostgreSQL connecté avec succès à', res.rows[0].now);
  }
});

module.exports = pool;