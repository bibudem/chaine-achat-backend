const ConfigModel = require('../models/config');
const { publicError } = require('../util/errors');

const sendSuccess = (res, data, msg = 'OK') =>
  res.json({ success: true, message: msg, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '') => {
  console.error(`[config.${context}]`, err.message);
  res.status(500).json({ success: false, error: publicError(err) });
};

/* GET /config */
exports.getConfig = async (req, res) => {
  try {
    const config = await ConfigModel.getConfig();
    sendSuccess(res, config, 'Configuration chargée');
  } catch (err) {
    sendError(res, err, 'getConfig');
  }
};

/* PUT /config/:cle */
exports.updateConfig = async (req, res) => {
  try {
    const { cle } = req.params;
    const { valeur, modifie_par } = req.body;

    if (!cle) {
      return res.status(400).json({ success: false, error: 'Clé manquante' });
    }

    const row = await ConfigModel.updateConfig(cle, valeur ?? '', modifie_par ?? null);

    if (!row) {
      return res.status(404).json({ success: false, error: `Clé introuvable : ${cle}` });
    }

    sendSuccess(res, row, `Paramètre « ${cle} » mis à jour`);
  } catch (err) {
    sendError(res, err, 'updateConfig');
  }
};
