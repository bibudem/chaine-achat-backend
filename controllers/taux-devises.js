const TauxDevisesModel = require('../models/taux-devises');
const { publicError } = require('../util/errors');

const sendSuccess = (res, data, msg = 'OK') =>
  res.json({ success: true, message: msg, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '') => {
  console.error(`[taux-devises.${context}]`, err.message);
  res.status(500).json({ success: false, error: publicError(err) });
};

/* GET /taux-devises */
exports.getAll = async (req, res) => {
  try {
    const rows = await TauxDevisesModel.getAll();
    sendSuccess(res, rows, 'Historique des taux chargé');
  } catch (err) {
    sendError(res, err, 'getAll');
  }
};

/* GET /taux-devises/actuelle — période en vigueur aujourd'hui (ignore une période planifiée
   pour une date future — voir Configuration > Taux de change) */
exports.getActuelle = async (req, res) => {
  try {
    const row = await TauxDevisesModel.getActuelle();
    sendSuccess(res, row, row ? 'Période actuelle chargée' : 'Aucune période en vigueur');
  } catch (err) {
    sendError(res, err, 'getActuelle');
  }
};

/* POST /taux-devises — nouvelle période */
exports.creerPeriode = async (req, res) => {
  try {
    const { periode, date_debut, taux, note, cree_par } = req.body;

    if (!periode || typeof periode !== 'string') {
      return res.status(400).json({ success: false, error: 'Période manquante' });
    }

    const row = await TauxDevisesModel.creerPeriode(
      periode.trim(), date_debut || null, taux || {}, note ?? null, cree_par ?? null
    );
    sendSuccess(res, row, `Période « ${periode} » créée`);
  } catch (err) {
    sendError(res, err, 'creerPeriode');
  }
};

/* PUT /taux-devises/:id — métadonnées de la période (libellé, date, note) */
exports.modifierPeriode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const { periode, date_debut, note, modifie_par } = req.body;
    const row = await TauxDevisesModel.modifierPeriode(id, { periode, date_debut, note }, modifie_par ?? null);

    if (!row) return res.status(404).json({ success: false, error: `Période introuvable : ${id}` });
    sendSuccess(res, row, 'Période mise à jour');
  } catch (err) {
    sendError(res, err, 'modifierPeriode');
  }
};

/* PUT /taux-devises/:id/devises/:devise — ajoute/modifie le taux d'une devise dans la période */
exports.upsertTauxDevise = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { devise } = req.params;
    if (!id || !devise) return res.status(400).json({ success: false, error: 'Paramètres invalides' });

    const tauxNum = Number(req.body.taux);
    if (!Number.isFinite(tauxNum) || tauxNum <= 0) {
      return res.status(400).json({ success: false, error: 'Taux invalide' });
    }

    const row = await TauxDevisesModel.upsertTauxDevise(id, devise.toUpperCase(), tauxNum, req.body.modifie_par ?? null);
    if (!row) return res.status(404).json({ success: false, error: `Période introuvable : ${id}` });
    sendSuccess(res, row, `Taux ${devise} mis à jour`);
  } catch (err) {
    sendError(res, err, 'upsertTauxDevise');
  }
};

/* DELETE /taux-devises/:id/devises/:devise — retire une devise de la période */
exports.supprimerTauxDevise = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { devise } = req.params;
    if (!id || !devise) return res.status(400).json({ success: false, error: 'Paramètres invalides' });

    const row = await TauxDevisesModel.supprimerTauxDevise(id, devise.toUpperCase(), req.body?.modifie_par ?? null);
    if (!row) return res.status(404).json({ success: false, error: `Période introuvable : ${id}` });
    sendSuccess(res, row, `Devise ${devise} retirée de la période`);
  } catch (err) {
    sendError(res, err, 'supprimerTauxDevise');
  }
};

/* DELETE /taux-devises/:id — supprime la période entière */
exports.supprimerPeriode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Identifiant invalide' });

    const row = await TauxDevisesModel.supprimerPeriode(id);
    if (!row) return res.status(404).json({ success: false, error: `Période introuvable : ${id}` });
    sendSuccess(res, row, 'Période supprimée');
  } catch (err) {
    sendError(res, err, 'supprimerPeriode');
  }
};
