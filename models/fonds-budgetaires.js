/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base : voir sql/fonds_budgetaires.sql
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

const FondsBudgetairesModel = {

  async list() {
    const { rows } = await pool.query(
      `SELECT fond_id, code, date_creation FROM tbl_fonds_budgetaires ORDER BY code`
    );
    return rows;
  },

  async create(code) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_fonds_budgetaires (code) VALUES ($1)
       RETURNING fond_id, code, date_creation`,
      [code]
    );
    return rows[0];
  },

  async update(fond_id, code) {
    const { rows } = await pool.query(
      `UPDATE tbl_fonds_budgetaires SET code = $2
       WHERE fond_id = $1
       RETURNING fond_id, code, date_creation`,
      [fond_id, code]
    );
    return rows[0] || null;
  },

  async remove(fond_id) {
    const { rowCount } = await pool.query(
      `DELETE FROM tbl_fonds_budgetaires WHERE fond_id = $1`,
      [fond_id]
    );
    return rowCount > 0;
  }
};

module.exports = FondsBudgetairesModel;
