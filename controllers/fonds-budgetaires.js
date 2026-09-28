const FondsBudgetairesModel = require('../models/fonds-budgetaires');
const { publicError } = require('../util/errors');

// Même format que dans les formulaires web (nouvel-achat, nouvel-abonnement,
// modification-ccol, requete-accessibilite, item-formulaire) : 2-4 lettres + tiret + chiffres.
const CODE_PATTERN = /^[A-Za-z]{2,4}-\d{2,}$/;

const sendSuccess = (res, data, msg = 'OK') =>
  res.json({ success: true, message: msg, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '', status = 500) => {
  console.error(`[fonds-budgetaires.${context}]`, err.message);
  res.status(status).json({ success: false, error: publicError(err) });
};

function validerCode(code) {
  if (!code || typeof code !== 'string') return null;
  const propre = code.trim().toUpperCase();
  return CODE_PATTERN.test(propre) ? propre : null;
}

/* GET /fonds-budgetaires */
exports.list = async (req, res) => {
  try {
    const rows = await FondsBudgetairesModel.list();
    sendSuccess(res, rows, 'Liste des fonds budgétaires chargée');
  } catch (err) {
    sendError(res, err, 'list');
  }
};

/* POST /fonds-budgetaires */
exports.create = async (req, res) => {
  try {
    const code = validerCode(req.body.code);
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code invalide (format attendu : 2-4 lettres, tiret, chiffres — ex. MO-999).' });
    }

    const row = await FondsBudgetairesModel.create(code);
    sendSuccess(res, row, `Fonds ${code} créé`);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ce code existe déjà.' });
    }
    sendError(res, err, 'create');
  }
};

/* PUT /fonds-budgetaires/:id */
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const code = validerCode(req.body.code);
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code invalide (format attendu : 2-4 lettres, tiret, chiffres — ex. MO-999).' });
    }

    const row = await FondsBudgetairesModel.update(id, code);
    if (!row) return res.status(404).json({ success: false, error: `Fonds introuvable : ${id}` });
    sendSuccess(res, row, 'Fonds mis à jour');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ce code existe déjà.' });
    }
    sendError(res, err, 'update');
  }
};

/* DELETE /fonds-budgetaires/:id */
exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const deleted = await FondsBudgetairesModel.remove(id);
    if (!deleted) return res.status(404).json({ success: false, error: `Fonds introuvable : ${id}` });
    sendSuccess(res, null, 'Fonds supprimé');
  } catch (err) {
    sendError(res, err, 'remove');
  }
};
