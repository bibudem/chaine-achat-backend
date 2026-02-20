const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const ReponsesModel = {

  async create({ type_formulaire, usager_nom, usager_courriel, usager_statut, reponses }) {
    const result = await pool.query(
      `INSERT INTO reponses_form 
        (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cree_le`,
      [type_formulaire, usager_nom, usager_courriel, usager_statut, JSON.stringify(reponses)]
    );
    return result.rows[0];
  },

  async findAll({ type, limit = 20, offset = 0 }) {
    const conditions = type ? 'WHERE type_formulaire = $3' : '';
    const params     = type ? [limit, offset, type] : [limit, offset];

    const result = await pool.query(
      `SELECT id, type_formulaire, usager_nom, usager_courriel,
              usager_statut, reponses, cree_le
       FROM reponses_form
       ${conditions}
       ORDER BY cree_le DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const count = await pool.query(
      `SELECT COUNT(*) FROM reponses_form ${type ? 'WHERE type_formulaire = $1' : ''}`,
      type ? [type] : []
    );

    return { rows: result.rows, total: parseInt(count.rows[0].count) };
  },

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM reponses_form WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
};

module.exports = ReponsesModel;