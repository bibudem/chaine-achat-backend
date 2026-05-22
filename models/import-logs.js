/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base :

   CREATE TABLE IF NOT EXISTS tbl_import_logs (
     log_id          SERIAL PRIMARY KEY,
     date_import     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
     formulaire_type VARCHAR(100),
     fichier_nom     VARCHAR(255),
     nb_total        INTEGER         NOT NULL DEFAULT 0,
     nb_inseres      INTEGER         NOT NULL DEFAULT 0,
     nb_erreurs      INTEGER         NOT NULL DEFAULT 0,
     details_erreurs JSONB,
     utilisateur     VARCHAR(255),
     statut          VARCHAR(20)     NOT NULL DEFAULT 'succès'
   );
   CREATE INDEX IF NOT EXISTS idx_import_logs_date ON tbl_import_logs (date_import DESC);
   CREATE INDEX IF NOT EXISTS idx_import_logs_type ON tbl_import_logs (formulaire_type);
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

const ImportLogsModel = {

  async create({ formulaire_type, fichier_nom, nb_total, nb_inseres, nb_erreurs, details_erreurs, utilisateur, statut }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_import_logs
         (formulaire_type, fichier_nom, nb_total, nb_inseres, nb_erreurs, details_erreurs, utilisateur, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        formulaire_type,
        fichier_nom,
        nb_total        ?? 0,
        nb_inseres      ?? 0,
        nb_erreurs      ?? 0,
        JSON.stringify(details_erreurs ?? []),
        utilisateur     || 'Inconnu',
        statut          || 'succès'
      ]
    );
    return rows[0];
  },

  async getAll({ page = 1, limit = 20, formulaire_type = null, statut = null } = {}) {
    const offset     = (page - 1) * limit;
    const conditions = [];
    const params     = [];

    if (formulaire_type) {
      params.push(formulaire_type);
      conditions.push(`formulaire_type = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`statut = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT log_id, date_import, formulaire_type, fichier_nom,
                nb_total, nb_inseres, nb_erreurs, utilisateur, statut
           FROM tbl_import_logs
           ${where}
           ORDER BY date_import DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM tbl_import_logs ${where}`,
        params
      )
    ]);

    return {
      logs:  dataRes.rows,
      total: countRes.rows[0].total,
      page,
      limit
    };
  },

  async getById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_import_logs WHERE log_id = $1`,
      [id]
    );
    return rows[0] || null;
  }
};

module.exports = ImportLogsModel;
