const Logs = require('../models/home');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPER — périodes autorisées (whitelist sécurité)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const VALID_PERIODS = ['7days', '30days', '90days'];

function sanitizePeriod(raw) {
  return VALID_PERIODS.includes(raw) ? raw : '7days';
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPER — réponses uniformes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const sendSuccess = (res, data, message = 'OK') =>
  res.status(200).json({ success: true, message, data, timestamp: new Date().toISOString() });

const sendError = (res, err, context = '') => {
  console.error(`❌ Erreur ${context}:`, err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Erreur serveur',
    timestamp: new Date().toISOString()
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /home/all?period=7days|30days|90days
   Dashboard + graphiques en un seul appel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
exports.getAllData = async (req, res) => {
  try {
    const period = sanitizePeriod(req.query.period);

    const [[dashboardRow], [graphRow]] = await Promise.all([
      Logs.fetchCountBoard(period),
      Logs.getGraphiqueDonnees(period)
    ]);

    sendSuccess(res, {
      dashboard: { success: true, data: dashboardRow?.dashboard_data ?? null },
      graph:     { success: true, data: graphRow?.graph_data ?? null }
    }, `Données récupérées — période : ${period}`);

  } catch (err) {
    sendError(res, err, 'getAllData');
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /home/dashboard?period=7days|30days|90days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
exports.getCount = async (req, res) => {
  try {
    const period = sanitizePeriod(req.query.period);
    const [row]  = await Logs.fetchCountBoard(period);

    if (!row?.dashboard_data) {
      return res.status(404).json({
        success: false,
        error: 'Aucune donnée dashboard disponible',
        timestamp: new Date().toISOString()
      });
    }

    sendSuccess(res, row.dashboard_data, `Données dashboard — période : ${period}`);
  } catch (err) {
    sendError(res, err, 'getCount');
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /home/graph?period=7days|30days|90days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
exports.getGraphiqueDonnees = async (req, res) => {
  try {
    const period = sanitizePeriod(req.query.period);
    const [row]  = await Logs.getGraphiqueDonnees(period);

    if (!row?.graph_data) {
      return res.status(404).json({
        success: false,
        error: 'Aucune donnée graphique disponible',
        timestamp: new Date().toISOString()
      });
    }

    sendSuccess(res, row.graph_data, `Données graphiques — période : ${period}`);
  } catch (err) {
    sendError(res, err, 'getGraphiqueDonnees');
  }
};