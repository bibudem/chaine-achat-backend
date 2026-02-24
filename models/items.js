const pool = require('../config/postgres.config');

// ==================== CREATE ITEM WITH SPECIFIC DATA ====================
async function postItems(req, res) {
  const client = await pool.connect();
  
  try {
    console.log('➡️ POST /api/items/add');
    console.log('Données reçues:', req.body);
    
    await client.query('BEGIN');
    
    const { specificData, formulaire_type, ...baseData } = req.body;
    
    // 1. Insérer dans tbl_items
    const itemColumns = Object.keys(baseData).join(', ');
    const itemValues = Object.values(baseData);
    const itemPlaceholders = itemValues.map((_, i) => `$${i + 1}`).join(', ');
    
    const itemQuery = `
      INSERT INTO tbl_items (${itemColumns})
      VALUES (${itemPlaceholders})
      RETURNING item_id
    `;
    
    const itemResult = await client.query(itemQuery, itemValues);
    const itemId = itemResult.rows[0].item_id;
    
    console.log(`✅ Item créé avec ID: ${itemId}`);
    
    // 2. Insérer dans la table spécifique selon le type
    if (specificData && Object.keys(specificData).length > 0) {
      await insertSpecificData(client, itemId, formulaire_type, specificData);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Item créé avec succès',
      data: { item_id: itemId, ...baseData, ...specificData }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur POST:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création',
      error: error.message
    });
  } finally {
    client.release();
  }
}

// ==================== UPDATE ITEM WITH SPECIFIC DATA ====================
async function putItems(req, res) {
  const client = await pool.connect();
  
  try {
    const itemId = req.params.id;
    console.log(`➡️ PUT /api/items/save/${itemId}`);
    console.log('Données reçues:', req.body);
    
    await client.query('BEGIN');
    
    const { specificData, formulaire_type, item_id, ...baseData } = req.body;
    
    // 1. Mettre à jour tbl_items
    const entries = Object.entries(baseData);
    if (entries.length > 0) {
      const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
      const values = [...entries.map(([, val]) => val), itemId];
      
      const updateQuery = `
        UPDATE tbl_items
        SET ${setClause}, date_modification = CURRENT_TIMESTAMP
        WHERE item_id = $${entries.length + 1}
        RETURNING *
      `;
      
      await client.query(updateQuery, values);
      console.log(`✅ Item ${itemId} mis à jour`);
    }
    
    // 2. Mettre à jour la table spécifique
    if (specificData && Object.keys(specificData).length > 0) {
      await updateSpecificData(client, itemId, formulaire_type, specificData);
    }
    
    await client.query('COMMIT');
    
    res.status(200).json({
      success: true,
      message: 'Item mis à jour avec succès',
      data: { item_id: itemId, ...baseData, ...specificData }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur PUT:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour',
      error: error.message
    });
  } finally {
    client.release();
  }
}

// ==================== GET ITEM BY ID WITH SPECIFIC DATA ====================
async function getItemById(req, res) {
  const client = await pool.connect();
  
  try {
    const itemId = req.params.id;
    console.log(`➡️ GET /api/items/fiche/${itemId}`);
    
    // 1. Récupérer l'item de base
    const itemQuery = 'SELECT * FROM tbl_items WHERE item_id = $1';
    const itemResult = await client.query(itemQuery, [itemId]);
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item non trouvé'
      });
    }
    
    const item = itemResult.rows[0];
    
    // 2. Récupérer les données spécifiques selon le type
    const specificData = await getSpecificData(client, itemId, item.formulaire_type);
    
    res.status(200).json({
      success: true,
      data: { ...item, ...specificData }
    });
    
  } catch (error) {
    console.error('❌ Erreur GET:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération',
      error: error.message
    });
  } finally {
    client.release();
  }
}

// ==================== HELPER: INSERT SPECIFIC DATA ====================
async function insertSpecificData(client, itemId, formulaireType, data) {
  let tableName, columns, values;

  switch (formulaireType) {
    case 'Modification CCOL':
      tableName = 'tbl_modification_ccol';
      break;
    case 'Nouvel abonnement':
      tableName = 'tbl_nouvel_abonnement';
      break;
    case 'Nouvel achat unique':
      tableName = 'tbl_nouvel_achat_unique';
      break;
    case 'PEB Tipasa numérique':
      tableName = 'tbl_peb_tipasa_numerique';
      break;
    case 'Requête ACQ':
      tableName = 'tbl_requete_acq';
      break;
    case 'Springer':
      tableName = 'tbl_springer';
      break;
    case 'Suggestion d\'achat':
      tableName = 'tbl_suggestion_achat';
      break;
    default:
      console.warn('⚠️ Type de formulaire non reconnu:', formulaireType);
      return;
  }

  // Filtrer les valeurs null / undefined / vides
  const filteredData = Object.entries(data)
    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

  if (Object.keys(filteredData).length === 0) {
    console.warn('⚠️ Aucune donnée spécifique à insérer');
    return;
  }

  columns = ['item_id', ...Object.keys(filteredData)].join(', ');
  values = [itemId, ...Object.values(filteredData)];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const updateClause = Object.keys(filteredData)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');

  const query = `
    INSERT INTO ${tableName} (${columns})
    VALUES (${placeholders})
    ON CONFLICT (item_id) DO UPDATE SET
      ${updateClause}
  `;

  // 👇 LOGS UTILES
  console.log('Table:', tableName);
  console.log('Requête SQL:', query.trim());
  console.log('Valeurs:', values);

  await client.query(query, values);

  console.log(`Données spécifiques insérées / mises à jour dans ${tableName}`);
}

// ==================== HELPER: UPDATE SPECIFIC DATA ====================
async function updateSpecificData(client, itemId, formulaireType, data) {
  let tableName;
  
  switch(formulaireType) {
    case 'Modification CCOL':
      tableName = 'tbl_modification_ccol';
      break;
    case 'Nouvel abonnement':
      tableName = 'tbl_nouvel_abonnement';
      break;
    case 'Nouvel achat unique':
      tableName = 'tbl_nouvel_achat_unique';
      break;
    case 'PEB Tipasa numérique':
      tableName = 'tbl_peb_tipasa_numerique';
      break;
    case 'Requête ACQ':
      tableName = 'tbl_requete_acq';
      break;
    case 'Springer':
      tableName = 'tbl_springer';
      break;
    case 'Suggestion d\'achat':
      tableName = 'tbl_suggestion_achat';
      break;
    default:
      console.log('Type de formulaire non reconnu:', formulaireType);
      return;
  }
  
  // Filtrer les valeurs null/undefined
  const filteredData = Object.entries(data)
    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
  
  if (Object.keys(filteredData).length === 0) {
    console.log('Aucune donnée spécifique à mettre à jour');
    return;
  }
  
  const entries = Object.entries(filteredData);
  const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
  const values = [...entries.map(([, val]) => val), itemId];
  
  // Vérifier si l'enregistrement existe
  const checkQuery = `SELECT item_id FROM ${tableName} WHERE item_id = $1`;
  const checkResult = await client.query(checkQuery, [itemId]);
  
  if (checkResult.rows.length > 0) {
    // UPDATE
    const updateQuery = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE item_id = $${entries.length + 1}
    `;
    await client.query(updateQuery, values);
    console.log(`Données spécifiques mises à jour dans ${tableName}`);
  } else {
    // INSERT si n'existe pas
    await insertSpecificData(client, itemId, formulaireType, filteredData);
  }
}

// ==================== HELPER: GET SPECIFIC DATA ====================
async function getSpecificData(client, itemId, formulaireType) {
  let tableName;
  
  switch(formulaireType) {
    case 'Modification CCOL':
      tableName = 'tbl_modification_ccol';
      break;
    case 'Nouvel abonnement':
      tableName = 'tbl_nouvel_abonnement';
      break;
    case 'Nouvel achat unique':
      tableName = 'tbl_nouvel_achat_unique';
      break;
    case 'PEB Tipasa numérique':
      tableName = 'tbl_peb_tipasa_numerique';
      break;
    case 'Requête ACQ':
      tableName = 'tbl_requete_acq';
      break;
    case 'Springer':
      tableName = 'tbl_springer';
      break;
    case 'Suggestion d\'achat':
      tableName = 'tbl_suggestion_achat';
      break;
    default:
      return {};
  }
  
  try {
    const query = `SELECT * FROM ${tableName} WHERE item_id = $1`;
    const result = await client.query(query, [itemId]);
    
    if (result.rows.length > 0) {
      const { item_id, ...specificData } = result.rows[0];
      return specificData;
    }
  } catch (error) {
    console.log(`Pas de données spécifiques dans ${tableName}:`, error.message);
  }
  
  return {};
}

// ==================== GET ALL ITEMS ====================
async function getAllItems(req, res) {
  const client = await pool.connect();
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    console.log(`GET /api/items/all - Limit: ${limit}, Offset: ${offset}`);
    
    const query = `
      SELECT * FROM tbl_items
      ORDER BY date_creation DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await client.query(query, [limit, offset]);
    
    // Compter le total
    const countQuery = 'SELECT COUNT(*) as total FROM tbl_items';
    const countResult = await client.query(countQuery);
    const total = parseInt(countResult.rows[0].total);
    
    console.log(`${result.rows.length} items récupérés sur ${total}`);
    
    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur GET ALL:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération',
      error: error.message
    });
  } finally {
    client.release();
  }
}

// ==================== DELETE ITEM ====================
async function deleteItem(req, res) {
  const client = await pool.connect();
  
  try {
    const itemId = req.params.id;
    console.log(`DELETE /api/items/delete/${itemId}`);
    
    const query = 'DELETE FROM tbl_items WHERE item_id = $1 RETURNING *';
    const result = await client.query(query, [itemId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item non trouvé'
      });
    }
    
    console.log(`Item ${itemId} supprimé (CASCADE vers tables spécifiques)`);
    
    res.status(200).json({
      success: true,
      message: 'Item supprimé avec succès',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erreur DELETE:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression',
      error: error.message
    });
  } finally {
    client.release();
  }
}

module.exports = {
  postItems,
  putItems,
  getItemById,
  getAllItems,
  deleteItem
};