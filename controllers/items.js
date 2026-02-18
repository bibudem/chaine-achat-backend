const pool = require('../config/postgres.config');

console.log('🎯 Chargement du contrôleur items...');

const itemsController = {
  // ==================== CREATE ====================
  postItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      console.log('➡️ POST /api/items/add');
      //console.log('Données reçues:', req.body);
      
      await client.query('BEGIN');
      
      const { specificData, formulaire_type, ...baseData } = req.body;
      
      // CORRECTION : Ajouter formulaire_type à baseData
      const fullBaseData = {
        ...baseData,
        formulaire_type  // <-- Ajouter le formulaire_type
      };
      
      // Supprimer les champs qui ne sont pas dans tbl_items
      delete fullBaseData.date_modification;
      delete fullBaseData.utilisateur_modification;
      
      // Filtrer les valeurs vides
      const cleanedBaseData = cleanEmptyFields(fullBaseData);
      
      // 1. Insérer dans tbl_items
      const itemColumns = Object.keys(cleanedBaseData).join(', ');
      const itemValues = Object.values(cleanedBaseData);
      const itemPlaceholders = itemValues.map((_, i) => `$${i + 1}`).join(', ');
      
      const itemQuery = `
        INSERT INTO tbl_items (${itemColumns})
        VALUES (${itemPlaceholders})
        RETURNING *
      `;
      
      console.log('📝 Exécution INSERT dans tbl_items');
      //console.log('Colonnes:', itemColumns);
      //console.log('Valeurs:', itemValues);
      
      const itemResult = await client.query(itemQuery, itemValues);
      const newItem = itemResult.rows[0];
      
      console.log(`✅ Item créé avec ID: ${newItem.item_id}`);
      
      // 2. Insérer dans la table spécifique selon le type
      if (specificData && Object.keys(specificData).length > 0) {
        await insertSpecificData(client, newItem.item_id, formulaire_type, specificData);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Item créé avec succès',
        data: newItem
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur POST:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== READ ONE ====================
  consulterItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const itemId = req.params.id;
      console.log('➡️ GET /api/items/fiche/' + itemId);
      
      // 1. Récupérer l'item de base
      const itemQuery = 'SELECT * FROM tbl_items WHERE item_id = $1';
      const itemResult = await client.query(itemQuery, [itemId]);
      
      if (itemResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item non trouvé'
        });
      }
      
      const item = itemResult.rows[0];
      
      // 2. Récupérer les données spécifiques selon le type
      const specificData = await getSpecificData(client, itemId, item.formulaire_type);
      
      console.log('✅ Item récupéré avec succès');
      res.json({
        success: true,
        data: { ...item, ...specificData }
      });
      
    } catch (error) {
      console.error('❌ Erreur GET:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== UPDATE ====================
  putItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const itemId = req.params.id;
      console.log('➡️ PUT /api/items/save/' + itemId);
      console.log('Données reçues:', req.body);
      
      await client.query('BEGIN');
      
      const { specificData, formulaire_type, item_id, date_modification, utilisateur_modification, ...baseData } = req.body;
      
      // Filtrer les valeurs vides
      const cleanedBaseData = cleanEmptyFields(baseData);
      
      // 1. Mettre à jour tbl_items
      const entries = Object.entries(cleanedBaseData);
      
      if (entries.length > 0) {
        const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
        const values = [...entries.map(([, val]) => val), itemId];
        
        const updateQuery = `
          UPDATE tbl_items
          SET ${setClause}, date_modification = CURRENT_TIMESTAMP
          WHERE item_id = $${entries.length + 1}
          RETURNING *
        `;
        
        console.log('📝 Exécution UPDATE dans tbl_items');
        const result = await client.query(updateQuery, values);
        
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            error: 'Item non trouvé pour la mise à jour'
          });
        }
      }
      
      // 2. Mettre à jour la table spécifique
      if (specificData && Object.keys(specificData).length > 0) {
        await updateSpecificData(client, itemId, formulaire_type, specificData);
      }
      
      await client.query('COMMIT');
      
      // 3. Récupérer l'item mis à jour
      const updatedItem = await client.query('SELECT * FROM tbl_items WHERE item_id = $1', [itemId]);
      
      console.log('✅ Item mis à jour avec succès');
      res.json({
        success: true,
        message: 'Item mis à jour avec succès',
        data: updatedItem.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur PUT:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== DELETE ====================
  deleteItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const itemId = req.params.id;
      console.log('➡️ DELETE /api/items/delete/' + itemId);
      
      const query = 'DELETE FROM tbl_items WHERE item_id = $1 RETURNING *';
      const result = await client.query(query, [itemId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item non trouvé pour la suppression'
        });
      }
      
      console.log(`✅ Item ${itemId} supprimé (CASCADE vers tables spécifiques)`);
      res.json({
        success: true,
        message: 'Item supprimé avec succès',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erreur DELETE:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== READ ALL + PAGINATION ====================
  getAllItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      console.log('➡️ GET /api/items/all');
      
      // Récupérer les paramètres de pagination depuis la query string
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const page = Math.floor(offset / limit) + 1;
      
      const query = `
        SELECT * FROM tbl_items
        ORDER BY date_creation DESC
        LIMIT $1 OFFSET $2
      `;
      
      const [itemsResult, countResult] = await Promise.all([
        client.query(query, [limit, offset]),
        client.query('SELECT COUNT(*) as total FROM tbl_items')
      ]);
      
      const items = itemsResult.rows;
      const total = parseInt(countResult.rows[0].total);
      
      console.log(`✅ ${items.length} items récupérés sur ${total}`);
      
      res.json({
        success: true,
        count: items.length,
        total: total,
        data: items,
        pagination: {
          page: page,
          limit: limit,
          offset: offset,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrevious: offset > 0,
          next: offset + limit < total ? offset + limit : null,
          previous: offset > 0 ? Math.max(0, offset - limit) : null
        }
      });
      
    } catch (error) {
      console.error('❌ Erreur GET /all:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== SEARCH ====================
  searchItems: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const searchTerm = req.query.q || '';
      console.log('➡️ GET /api/items/search - Terme:', searchTerm);
      
      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          error: 'Paramètre de recherche "q" requis'
        });
      }
      
      const query = `
        SELECT * FROM tbl_items
        WHERE 
          titre_document ILIKE $1 OR
          demandeur ILIKE $1 OR
          isbn_issn ILIKE $1 OR
          editeur ILIKE $1
        ORDER BY date_creation DESC
        LIMIT 100
      `;
      
      const searchPattern = `%${searchTerm}%`;
      const result = await client.query(query, [searchPattern]);
      
      console.log(`✅ ${result.rows.length} items trouvés`);
      res.json({
        success: true,
        count: result.rows.length,
        searchTerm: searchTerm,
        data: result.rows
      });
      
    } catch (error) {
      console.error('❌ Erreur GET /search:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== FILTER BY TYPE ====================
  getItemsByType: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const type = req.params.type;
      console.log('➡️ GET /api/items/type/' + type);
      
      const query = `
        SELECT * FROM tbl_items
        WHERE formulaire_type = $1
        ORDER BY date_creation DESC
      `;
      
      const result = await client.query(query, [type]);
      
      console.log(`✅ ${result.rows.length} items de type "${type}" trouvés`);
      res.json({
        success: true,
        count: result.rows.length,
        type: type,
        data: result.rows
      });
      
    } catch (error) {
      console.error('❌ Erreur GET /type:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== FILTER BY STATUS ====================
  getItemsByStatus: async (req, res) => {
    const client = await pool.connect();
    
    try {
      const status = req.params.status;
      console.log('➡️ GET /api/items/status/' + status);
      
      const query = `
        SELECT * FROM tbl_items
        WHERE statut_bibliotheque = $1
        ORDER BY date_creation DESC
      `;
      
      const result = await client.query(query, [status]);
      
      console.log(`✅ ${result.rows.length} items avec statut "${status}" trouvés`);
      res.json({
        success: true,
        count: result.rows.length,
        status: status,
        data: result.rows
      });
      
    } catch (error) {
      console.error('❌ Erreur GET /status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== STATISTICS ====================
  getStatistics: async (req, res) => {
    const client = await pool.connect();
    
    try {
      console.log('➡️ GET /api/items/statistics');
      
      const [totalResult, byTypeResult, byStatusResult] = await Promise.all([
        client.query('SELECT COUNT(*) as total FROM tbl_items'),
        client.query(`
          SELECT formulaire_type, COUNT(*) as count
          FROM tbl_items
          GROUP BY formulaire_type
          ORDER BY count DESC
        `),
        client.query(`
          SELECT statut_bibliotheque, COUNT(*) as count
          FROM tbl_items
          GROUP BY statut_bibliotheque
          ORDER BY count DESC
        `)
      ]);
      
      console.log('✅ Statistiques récupérées avec succès');
      res.json({
        success: true,
        data: {
          total: parseInt(totalResult.rows[0].total),
          byType: byTypeResult.rows,
          byStatus: byStatusResult.rows
        }
      });
      
    } catch (error) {
      console.error('❌ Erreur GET /statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  },

  // ==================== BATCH CREATE ====================
  createBatch: async (req, res) => {
    const client = await pool.connect();
    
    try {
      console.log('➡️ POST /api/items/batch');
      console.log(`Nombre d'items à créer: ${req.body.length}`);
      
      if (!Array.isArray(req.body)) {
        return res.status(400).json({
          success: false,
          error: 'Le body doit être un tableau d\'objets'
        });
      }
      
      await client.query('BEGIN');
      
      const results = [];
      
      for (const itemData of req.body) {
        const cleaned = cleanEmptyFields(itemData);
        const columns = Object.keys(cleaned).join(', ');
        const values = Object.values(cleaned);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        
        const query = `
          INSERT INTO tbl_items (${columns})
          VALUES (${placeholders})
          RETURNING *
        `;
        
        const result = await client.query(query, values);
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      console.log(`✅ ${results.length} items créés avec succès`);
      res.status(201).json({
        success: true,
        message: `${results.length} items créés avec succès`,
        count: results.length,
        data: results
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur POST /batch:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      client.release();
    }
  }
};

// ==================== HELPER FUNCTIONS ====================

// Fonction utilitaire pour nettoyer les champs vides
function cleanEmptyFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key, value]) => {
        return value !== undefined && value !== null && value !== '';
      })
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, value.trim()];
        }
        return [key, value];
      })
  );
}

// Insérer dans la table spécifique
async function insertSpecificData(client, itemId, formulaireType, data) {
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
      console.log('⚠️ Type de formulaire non reconnu:', formulaireType);
      return;
  }
  
  const filteredData = cleanEmptyFields(data);
  
  if (Object.keys(filteredData).length === 0) {
    console.log('⚠️ Aucune donnée spécifique à insérer');
    return;
  }
  
  const columns = ['item_id', ...Object.keys(filteredData)].join(', ');
  const values = [itemId, ...Object.values(filteredData)];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  
  const updateClause = Object.keys(filteredData)
    .map(key => `${key} = EXCLUDED.${key}`)
    .join(', ');
  
  const query = `
    INSERT INTO ${tableName} (${columns})
    VALUES (${placeholders})
    ON CONFLICT (item_id) DO UPDATE SET ${updateClause}
  `;
  
  console.log(`📝 Insertion dans ${tableName}`);
  await client.query(query, values);
  console.log(`✅ Données spécifiques insérées dans ${tableName}`);
}

// Mettre à jour la table spécifique
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
      console.log('⚠️ Type de formulaire non reconnu:', formulaireType);
      return;
  }
  
  const filteredData = cleanEmptyFields(data);
  
  if (Object.keys(filteredData).length === 0) {
    console.log('⚠️ Aucune donnée spécifique à mettre à jour');
    return;
  }
  
  const checkQuery = `SELECT item_id FROM ${tableName} WHERE item_id = $1`;
  const checkResult = await client.query(checkQuery, [itemId]);
  
  if (checkResult.rows.length > 0) {
    const entries = Object.entries(filteredData);
    const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = [...entries.map(([, val]) => val), itemId];
    
    const updateQuery = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE item_id = $${entries.length + 1}
    `;
    
    console.log(`📝 Mise à jour dans ${tableName}`);
    await client.query(updateQuery, values);
    console.log(`✅ Données spécifiques mises à jour dans ${tableName}`);
  } else {
    await insertSpecificData(client, itemId, formulaireType, filteredData);
  }
}

// Récupérer les données spécifiques
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
      console.log(`✅ Données spécifiques récupérées de ${tableName}`);
      return specificData;
    }
  } catch (error) {
    console.log(`⚠️ Pas de données spécifiques dans ${tableName}:`, error.message);
  }
  
  return {};
}

console.log('✅ Contrôleur items initialisé avec succès');

module.exports = itemsController;