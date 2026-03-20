// models/import.js
// Couche d'accès aux données pour les imports Excel
// Utilisé par le contrôleur import.js

const pool = require('../config/postgres.config');

console.log('📦 Chargement du modèle import...');

// ==================== MAPPING TYPE → TABLE ====================
const TYPE_TABLE_MAP = {
  'Modification CCOL':    'tbl_modification_ccol',
  'Nouvel abonnement':    'tbl_nouvel_abonnement',
  'Nouvel achat unique':  'tbl_nouvel_achat_unique',
  'PEB Tipasa numérique': 'tbl_peb_tipasa_numerique',
  'Requête ACQ':          'tbl_requete_acq',
  'Springer':             'tbl_springer',
  "Suggestion d'achat":  'tbl_suggestion_achat',
};

// ==================== INSERT ITEM DE BASE ====================
async function insertItemBase(client, baseData) {
  const cleaned      = cleanEmptyFields(baseData);
  const columns      = Object.keys(cleaned).join(', ');
  const values       = Object.values(cleaned);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO tbl_items (${columns})
    VALUES (${placeholders})
    RETURNING item_id
  `;

  const result = await client.query(query, values);
  return result.rows[0].item_id;
}

// ==================== INSERT DONNÉES SPÉCIFIQUES ====================
async function insertSpecificData(client, itemId, formulaireType, specificData) {
  const tableName = TYPE_TABLE_MAP[formulaireType];

  if (!tableName) {
    console.warn('⚠️ Type de formulaire non reconnu:', formulaireType);
    return;
  }

  const filtered = cleanEmptyFields(specificData);

  if (Object.keys(filtered).length === 0) {
    console.warn('⚠️ Aucune donnée spécifique à insérer pour', formulaireType);
    return;
  }

  const columns    = ['item_id', ...Object.keys(filtered)].join(', ');
  const values     = [itemId, ...Object.values(filtered)];
  const holders    = values.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet  = Object.keys(filtered)
    .map(key => `${key} = EXCLUDED.${key}`)
    .join(', ');

  const query = `
    INSERT INTO ${tableName} (${columns})
    VALUES (${holders})
    ON CONFLICT (item_id) DO UPDATE SET ${updateSet}
  `;

  console.log(`  Insertion dans ${tableName}`);
  await client.query(query, values);
  console.log(`  ✅ Données spécifiques insérées dans ${tableName}`);
}

// ==================== IMPORT EN BATCH (transaction complète) ====================
async function importRows(formulaireType, rows, buildBaseData, buildSpecificData) {
  const client  = await pool.connect();
  const results = { inserted: 0, errors: [] };

  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const baseData     = buildBaseData(row, formulaireType);
        const itemId       = await insertItemBase(client, baseData);
        const specificData = buildSpecificData(row);

        await insertSpecificData(client, itemId, formulaireType, specificData);
        results.inserted++;
        console.log(`  ✅ Ligne ${i + 2} insérée (item_id: ${itemId})`);
      } catch (rowErr) {
        console.error(`  ❌ Erreur ligne ${i + 2}:`, rowErr.message);
        results.errors.push({ ligne: i + 2, erreur: rowErr.message });
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Transaction validée: ${results.inserted} insérée(s), ${results.errors.length} erreur(s)`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Rollback transaction import:', err.message);
    throw err;
  } finally {
    client.release();
  }

  return results;
}

// ==================== VÉRIFIER UN TYPE ====================
function isValidType(formulaireType) {
  return !!TYPE_TABLE_MAP[formulaireType];
}

function getValidTypes() {
  return Object.keys(TYPE_TABLE_MAP);
}

// ==================== HELPER INTERNE ====================
function cleanEmptyFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (typeof value === 'string') return [key, value.trim()];
        return [key, value];
      })
  );
}

console.log('✅ Modèle import initialisé avec succès');

module.exports = {
  insertItemBase,
  insertSpecificData,
  importRows,
  isValidType,
  getValidTypes,
  TYPE_TABLE_MAP,
};