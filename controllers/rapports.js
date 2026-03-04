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
    const { dateDebut, dateFin } = req.query;
    const data = await rapportsModel.statistiquesGenerales({ dateDebut, dateFin });
    return success(res, data);
  } catch (e) { return error(res, e); }
};

// ======================
// DÉTAILLÉ (seul endpoint utilisé par le frontend)
// Tous les regroupements (par type, bibliothèque, etc.)
// sont calculés côté Angular sur ces données.
// ======================
exports.getRapportDetaille = async (req, res) => {
  try {
    const filters = pick(req.query, [
      'dateDebut', 'dateFin', 'id',
      'formulaire_type', 'priorite', 'bibliotheque', 'demandeur',
      'typeDocument', 'support', 'fonds', 'editeur', 'annee',
      'statutBibliotheque', 'statutAcq'
    ]);
    const { limit, offset } = req.query;
    const result = await rapportsModel.rapportDetaille(filters, limit, offset);
    return success(res, result.data, {
      pagination: {
        total:  result.total,
        limit:  result.limit,
        offset: result.offset,
        pages:  result.limit ? Math.ceil(result.total / result.limit) : 1
      }
    });
  } catch (e) { return error(res, e); }
};