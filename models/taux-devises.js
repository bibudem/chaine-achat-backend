const pool = require('../config/postgres.config');

/* Voir sql/taux_devises_historique.sql pour la définition de la table.
   Une ligne = une période (ex. "2025-2026"), les taux de chaque devise pour cette période
   étant regroupés dans la colonne JSONB `taux` (ex. { "USD": 1.368, "EUR": 1.48 }). */

/* ── Liste de toutes les périodes, de la plus récente à la plus ancienne ── */
const getAll = async () => {
  const res = await pool.query(
    `SELECT * FROM public.tbl_taux_devises_historique
     ORDER BY date_debut DESC, id DESC`
  );
  return res.rows;
};

/* ── Période actuellement en vigueur (date_debut <= maintenant), la plus récente si plusieurs
   qualifient — permet d'ignorer une période planifiée pour une date future (voir
   Configuration > Taux de change) tant que sa date de début n'est pas encore arrivée. ── */
const getActuelle = async () => {
  const res = await pool.query(
    `SELECT * FROM public.tbl_taux_devises_historique
     WHERE date_debut <= NOW()
     ORDER BY date_debut DESC, id DESC
     LIMIT 1`
  );
  return res.rows[0] ?? null;
};

/* ── Nouvelle période (ligne) ── */
const creerPeriode = async (periode, date_debut, taux = {}, note = null, cree_par = null) => {
  const res = await pool.query(
    `INSERT INTO public.tbl_taux_devises_historique
       (periode, date_debut, taux, note, cree_par)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [periode, date_debut || new Date(), JSON.stringify(taux || {}), note, cree_par]
  );
  return res.rows[0];
};

/* ── Métadonnées d'une période (libellé, date, note) — ne touche pas aux taux ── */
const modifierPeriode = async (id, { periode, date_debut, note }, modifie_par = null) => {
  const res = await pool.query(
    `UPDATE public.tbl_taux_devises_historique
     SET periode     = COALESCE($2, periode),
         date_debut  = COALESCE($3, date_debut),
         note        = COALESCE($4, note),
         date_modif  = CURRENT_TIMESTAMP,
         modifie_par = $5
     WHERE id = $1
     RETURNING *`,
    [id, periode ?? null, date_debut ?? null, note ?? null, modifie_par]
  );
  return res.rows[0] ?? null;
};

/* ── Ajoute ou modifie le taux d'une devise au sein d'une période, sans toucher aux autres ── */
const upsertTauxDevise = async (id, devise, taux, modifie_par = null) => {
  const res = await pool.query(
    `UPDATE public.tbl_taux_devises_historique
     SET taux        = jsonb_set(taux, ARRAY[$2::text], to_jsonb($3::numeric), true),
         date_modif  = CURRENT_TIMESTAMP,
         modifie_par = $4
     WHERE id = $1
     RETURNING *`,
    [id, devise, taux, modifie_par]
  );
  return res.rows[0] ?? null;
};

/* ── Retire une devise d'une période (ne supprime pas la ligne) ── */
const supprimerTauxDevise = async (id, devise, modifie_par = null) => {
  const res = await pool.query(
    `UPDATE public.tbl_taux_devises_historique
     SET taux        = taux - $2::text,
         date_modif  = CURRENT_TIMESTAMP,
         modifie_par = $3
     WHERE id = $1
     RETURNING *`,
    [id, devise, modifie_par]
  );
  return res.rows[0] ?? null;
};

/* ── Supprime une période (ligne) entière ── */
const supprimerPeriode = async (id) => {
  const res = await pool.query(
    `DELETE FROM public.tbl_taux_devises_historique WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0] ?? null;
};

module.exports = {
  getAll,
  getActuelle,
  creerPeriode,
  modifierPeriode,
  upsertTauxDevise,
  supprimerTauxDevise,
  supprimerPeriode,
};
