const BibliothequesModel = require('../models/bibliotheques');
const { publicError } = require('../util/errors');

const sendSuccess = (res, data, msg = 'OK') =>
  res.json({ success: true, message: msg, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '', status = 500) => {
  console.error(`[bibliotheques.${context}]`, err.message);
  res.status(status).json({ success: false, error: publicError(err) });
};

function validerNom(nom) {
  if (!nom || typeof nom !== 'string') return null;
  const propre = nom.trim();
  return (propre.length >= 2 && propre.length <= 255) ? propre : null;
}

/* GET /bibliotheques */
exports.list = async (req, res) => {
  try {
    const rows = await BibliothequesModel.list();
    sendSuccess(res, rows, 'Liste des bibliothèques chargée');
  } catch (err) {
    sendError(res, err, 'list');
  }
};

/* POST /bibliotheques */
exports.create = async (req, res) => {
  try {
    const nom = validerNom(req.body.nom);
    if (!nom) {
      return res.status(400).json({ success: false, error: 'Nom invalide (2 à 255 caractères).' });
    }

    const row = await BibliothequesModel.create(nom);
    sendSuccess(res, row, `Bibliothèque ${nom} créée`);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Cette bibliothèque existe déjà.' });
    }
    sendError(res, err, 'create');
  }
};

/* PUT /bibliotheques/:id */
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const nom = validerNom(req.body.nom);
    if (!nom) {
      return res.status(400).json({ success: false, error: 'Nom invalide (2 à 255 caractères).' });
    }

    const row = await BibliothequesModel.update(id, nom);
    if (!row) return res.status(404).json({ success: false, error: `Bibliothèque introuvable : ${id}` });
    sendSuccess(res, row, 'Bibliothèque mise à jour');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Cette bibliothèque existe déjà.' });
    }
    sendError(res, err, 'update');
  }
};

/* DELETE /bibliotheques/:id */
exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const deleted = await BibliothequesModel.remove(id);
    if (!deleted) return res.status(404).json({ success: false, error: `Bibliothèque introuvable : ${id}` });
    sendSuccess(res, null, 'Bibliothèque supprimée');
  } catch (err) {
    sendError(res, err, 'remove');
  }
};
