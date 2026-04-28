const { Pool } = require('pg');

// En Lambda, chaque instance peut gérer plusieurs requêtes simultanées sur une même
// invocation chaude — max:2 évite l'épuisement de connexions côté RDS.
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 2,
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