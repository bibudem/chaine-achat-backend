const pool = require('../config/postgres.config');

/* ── Lecture de toute la config ── */
const getConfig = async () => {
  const res = await pool.query(
    'SELECT cle, valeur FROM public.tbl_app_config ORDER BY cle'
  );
  const config = {};
  res.rows.forEach(row => { config[row.cle] = row.valeur ?? ''; });
  return config;
};

/* ── Upsert d'une entrée (INSERT si inexistante, UPDATE sinon) ── */
const updateConfig = async (cle, valeur, modifie_par = null) => {
  const res = await pool.query(
    `INSERT INTO public.tbl_app_config (cle, valeur, datem, modifie_par)
     VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
     ON CONFLICT (cle)
     DO UPDATE SET
       valeur      = EXCLUDED.valeur,
       datem       = CURRENT_TIMESTAMP,
       modifie_par = EXCLUDED.modifie_par
     RETURNING *`,
    [cle, valeur, modifie_par]
  );
  return res.rows[0] ?? null;
};

module.exports = { getConfig, updateConfig };
