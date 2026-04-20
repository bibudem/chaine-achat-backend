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

/* ── Mise à jour d'une entrée ── */
const updateConfig = async (cle, valeur, modifie_par = null) => {
  const res = await pool.query(
    `UPDATE public.tbl_app_config
        SET valeur      = $1,
            datem       = CURRENT_TIMESTAMP,
            modifie_par = $2
      WHERE cle = $3
  RETURNING *`,
    [valeur, modifie_par, cle]
  );
  return res.rows[0] ?? null;
};

module.exports = { getConfig, updateConfig };
