// util/db-columns.js
//
// Protection contre l'injection SQL via des noms de colonnes non validés : plusieurs endroits
// du backend construisent des requêtes INSERT/UPDATE dynamiques à partir des clés d'un objet
// JSON envoyé par le client (Object.keys(req.body...)), et interpolent ces clés directement
// dans le texte SQL sans les paramétrer — seules les VALEURS passent par $1, $2... ; les noms
// de colonnes ne peuvent pas être paramétrés en SQL. Ce module filtre ces clés contre la
// liste réelle des colonnes de la table en base (introspection information_schema), ce qui
// élimine le risque peu importe la table/le type de formulaire, sans avoir à maintenir une
// liste blanche manuelle qui pourrait devenir incomplète et bloquer des champs légitimes.
const pool = require('../config/postgres.config');

const cache = new Map(); // tableName -> { columns: Set<string>, at: number }
const CACHE_TTL_MS = 5 * 60 * 1000; // le schéma change rarement — évite une requête par appel

async function getTableColumns(tableName) {
  const cached = cache.get(tableName);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.columns;

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  if (rows.length === 0) {
    throw new Error(`Table inconnue ou sans colonnes accessible : "${tableName}"`);
  }
  const columns = new Set(rows.map(r => r.column_name));
  cache.set(tableName, { columns, at: Date.now() });
  return columns;
}

/**
 * Filtre `data` pour ne garder que les clés qui correspondent à de vraies colonnes de
 * `tableName` (jamais celles listées dans `excludeKeys`, ex. la clé primaire). Toute clé
 * rejetée est simplement ignorée plutôt que de faire échouer toute la requête pour un champ
 * superflu — même tolérance que cleanEmptyFields ailleurs dans le code.
 */
async function filterToTableColumns(tableName, data, excludeKeys = []) {
  const columns = await getTableColumns(tableName);
  const excluded = new Set(excludeKeys);
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (columns.has(key) && !excluded.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

module.exports = { getTableColumns, filterToTableColumns };
