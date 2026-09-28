/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base : voir sql/bibliotheques.sql
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

const BibliothequesModel = {

  async list() {
    const { rows } = await pool.query(
      `SELECT bib_id, nom, date_creation FROM tbl_bibliotheques ORDER BY nom`
    );
    return rows;
  },

  async create(nom) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_bibliotheques (nom) VALUES ($1)
       RETURNING bib_id, nom, date_creation`,
      [nom]
    );
    return rows[0];
  },

  async update(bib_id, nom) {
    const { rows } = await pool.query(
      `UPDATE tbl_bibliotheques SET nom = $2
       WHERE bib_id = $1
       RETURNING bib_id, nom, date_creation`,
      [bib_id, nom]
    );
    return rows[0] || null;
  },

  async remove(bib_id) {
    const { rowCount } = await pool.query(
      `DELETE FROM tbl_bibliotheques WHERE bib_id = $1`,
      [bib_id]
    );
    return rowCount > 0;
  }
};

module.exports = BibliothequesModel;
