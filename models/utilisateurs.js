/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base : voir sql/utilisateurs.sql
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

const UtilisateursModel = {

  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_utilisateurs WHERE lower(email) = lower($1)`,
      [email]
    );
    return rows[0] || null;
  },

  // Appelé à chaque login réussi : crée l'usager (rôle par défaut Usager) s'il
  // n'existe pas encore, sinon met à jour nom/prénom/dernière connexion —
  // le rôle est géré manuellement en base, jamais écrasé ici.
  async upsertFromLogin({ email, nom, prenom }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_utilisateurs (email, nom, prenom)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET nom = EXCLUDED.nom,
             prenom = EXCLUDED.prenom,
             date_derniere_connexion = NOW()
       RETURNING *`,
      [email, nom, prenom]
    );
    return rows[0];
  },

  async list() {
    const { rows } = await pool.query(
      `SELECT utilisateur_id, email, nom, prenom, role, date_creation, date_derniere_connexion
         FROM tbl_utilisateurs
        ORDER BY nom, prenom`
    );
    return rows;
  },

  // Pré-provisionner un usager (ex. Admin/TDM) avant même son premier login Azure AD.
  async create({ email, nom, prenom, role }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_utilisateurs (email, nom, prenom, role)
       VALUES ($1, $2, $3, $4)
       RETURNING utilisateur_id, email, nom, prenom, role, date_creation, date_derniere_connexion`,
      [email, nom ?? null, prenom ?? null, role]
    );
    return rows[0];
  },

  // Mise à jour partielle : seuls les champs fournis (non undefined) sont modifiés.
  async update(utilisateur_id, { email, nom, prenom, role }) {
    const { rows } = await pool.query(
      `UPDATE tbl_utilisateurs SET
         email  = COALESCE($2, email),
         nom    = COALESCE($3, nom),
         prenom = COALESCE($4, prenom),
         role   = COALESCE($5, role)
       WHERE utilisateur_id = $1
       RETURNING utilisateur_id, email, nom, prenom, role, date_creation, date_derniere_connexion`,
      [utilisateur_id, email ?? null, nom ?? null, prenom ?? null, role ?? null]
    );
    return rows[0] || null;
  },

  async remove(utilisateur_id) {
    const { rowCount } = await pool.query(
      `DELETE FROM tbl_utilisateurs WHERE utilisateur_id = $1`,
      [utilisateur_id]
    );
    return rowCount > 0;
  }
};

module.exports = UtilisateursModel;
