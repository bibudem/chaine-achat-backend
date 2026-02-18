// controllers/rapports.js
const rapportsModel = require('../models/rapports');

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function success(res, data, extra = {}) {
  return res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
    ...extra
  });
}

function error(res, e) {
  console.error('❌ Erreur contrôleur:', e);
  return res.status(500).json({
    success: false,
    message: e.message,
    timestamp: new Date().toISOString()
  });
}

// ======================
// STATISTIQUES
// ======================
exports.getStatistiquesGenerales = async (req, res) => {
  try {
    console.log('📊 GET /rapports/statistiques - Query:', req.query);
    const { dateDebut, dateFin } = req.query;
    const data = await rapportsModel.statistiquesGenerales({ dateDebut, dateFin });

    return success(res, data);
  } catch (e) {
    return error(res, e);
  }
};

// ======================
// PAR TYPE
// ======================
exports.getRapportParType = async (req, res) => {
  try {
    console.log('📊 GET /rapports/par-type - Query:', req.query);
    const { dateDebut, dateFin, formulaireType } = req.query;
    const data = await rapportsModel.rapportParType({ dateDebut, dateFin, formulaireType });

    return success(res, data);
  } catch (e) {
    return error(res, e);
  }
};

// ======================
// DETAILLE
// ======================
exports.getRapportDetaille = async (req, res) => {
  try {
    console.log('📊 GET /rapports/detaille - Query:', req.query);
    
    // Extraire tous les filtres possibles
    const filters = pick(req.query, [
      'dateDebut', 
      'dateFin',
      'id', 
      'formulaireType', 
      'priorite', 
      'bibliotheque', 
      'demandeur',
      'typeDocument', 
      'support', 
      'fonds', 
      'editeur', 
      'annee',
      'statutBibliotheque', 
      'statutAcq'
    ]);

    const { limit, offset } = req.query;

    console.log('🔍 Filtres appliqués:', filters);
    console.log('📄 Pagination:', { limit, offset });

    const result = await rapportsModel.rapportDetaille(filters, limit, offset);
    
    console.log('✅ Résultat:', {
      lignes: result.data.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });

    // Log détaillé des colonnes retournées
    if (result.data.length > 0) {
      const colonnes = Object.keys(result.data[0]);
      console.log('📊 Colonnes retournées:', colonnes.length);
      console.log('   Colonnes:', colonnes.join(', '));
      console.log('📝 Premier élément (keys):', colonnes);
      
      // Vérifier si les colonnes importantes sont présentes
      const important = ['titre', 'titre_document', 'formulaire_type', 'demandeur', 'id', 'item_id'];
      const found = important.filter(col => colonnes.includes(col));
      const missing = important.filter(col => !colonnes.includes(col));
      console.log('✅ Colonnes importantes trouvées:', found);
      if (missing.length > 0) {
        console.log('⚠️  Colonnes manquantes:', missing);
      }
    }

    return success(res, result.data, {
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        pages: result.limit ? Math.ceil(result.total / result.limit) : 1
      }
    });

  } catch (e) {
    return error(res, e);
  }
};