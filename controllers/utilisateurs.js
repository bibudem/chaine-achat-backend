const UtilisateursModel = require('../models/utilisateurs');
const { publicError } = require('../util/errors');

const ROLES_VALIDES = ['Admin', 'TDM', 'Usager'];

const sendSuccess = (res, data, msg = 'OK') =>
  res.json({ success: true, message: msg, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '', status = 500) => {
  console.error(`[utilisateurs.${context}]`, err.message);
  res.status(status).json({ success: false, error: publicError(err) });
};

/* GET /utilisateurs */
exports.list = async (req, res) => {
  try {
    const rows = await UtilisateursModel.list();
    sendSuccess(res, rows, 'Liste des usagers chargée');
  } catch (err) {
    sendError(res, err, 'list');
  }
};

/* POST /utilisateurs — pré-provisionner un usager avant son premier login */
exports.create = async (req, res) => {
  try {
    const { email, nom, prenom, role } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Courriel manquant' });
    }
    if (!ROLES_VALIDES.includes(role)) {
      return res.status(400).json({ success: false, error: `Rôle invalide (attendu : ${ROLES_VALIDES.join(', ')})` });
    }

    const row = await UtilisateursModel.create({ email: email.trim(), nom, prenom, role });
    sendSuccess(res, row, `Usager ${email} créé`);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ce courriel existe déjà.' });
    }
    sendError(res, err, 'create');
  }
};

/* PUT /utilisateurs/:id — mise à jour partielle (email/nom/prenom/role) */
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const { email, nom, prenom, role } = req.body;

    if (role !== undefined && !ROLES_VALIDES.includes(role)) {
      return res.status(400).json({ success: false, error: `Rôle invalide (attendu : ${ROLES_VALIDES.join(', ')})` });
    }
    if (email !== undefined && (!email || typeof email !== 'string')) {
      return res.status(400).json({ success: false, error: 'Courriel invalide' });
    }

    const row = await UtilisateursModel.update(id, { email: email?.trim(), nom, prenom, role });
    if (!row) return res.status(404).json({ success: false, error: `Usager introuvable : ${id}` });
    sendSuccess(res, row, 'Usager mis à jour');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ce courriel existe déjà.' });
    }
    sendError(res, err, 'update');
  }
};

/* DELETE /utilisateurs/:id */
exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const deleted = await UtilisateursModel.remove(id);
    if (!deleted) return res.status(404).json({ success: false, error: `Usager introuvable : ${id}` });
    sendSuccess(res, null, 'Usager supprimé');
  } catch (err) {
    sendError(res, err, 'remove');
  }
};
