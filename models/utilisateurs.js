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

  // Appelé à chaque login réussi : met à jour nom/prénom/dernière connexion d'un profil
  // existant (SuperAdmin, Admin, TechDoc, TDM… créés dans Configuration > Utilisateurs) et le
  // renvoie, ou null s'il n'y en a pas. Ne crée jamais de profil : Employe/Usager n'ont pas
  // besoin d'être en base, leur rôle est déduit à chaque login (voir auth/callback.js). Le
  // rôle d'un profil existant n'est jamais modifié ici.
  async majConnexion({ email, nom, prenom }) {
    const { rows } = await pool.query(
      `UPDATE tbl_utilisateurs
          SET nom = $2,
              prenom = $3,
              date_derniere_connexion = NOW()
        WHERE lower(email) = lower($1)
        RETURNING *`,
      [email, nom, prenom]
    );
    return rows[0] || null;
  },

  async list() {
    const { rows } = await pool.query(
      `SELECT utilisateur_id, email, nom, prenom, role, date_creation, date_derniere_connexion
         FROM tbl_utilisateurs
        ORDER BY nom, prenom`
    );
    return rows;
  },

  // Courriels de tous les utilisateurs d'un rôle — ex. l'équipe TechDoc, avisée par courriel
  // de chaque nouvelle suggestion publique (voir ReponsesController.createSuggestionPublique).
  async courrielsParRole(role) {
    const { rows } = await pool.query(
      `SELECT email FROM tbl_utilisateurs WHERE role = $1 AND email IS NOT NULL AND email <> '' ORDER BY email`,
      [role]
    );
    return rows.map(r => r.email);
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
