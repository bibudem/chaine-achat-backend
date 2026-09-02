const ImportLogsModel = require('../models/import-logs');
const { publicError } = require('../util/errors');

const ImportLogsController = {

  async getAll(req, res) {
    try {
      const page           = Math.max(1, parseInt(req.query.page)  || 1);
      const limit          = Math.min(100, parseInt(req.query.limit) || 20);
      const formulaire_type = req.query.type        || null;
      const statut          = req.query.statut      || null;
      const utilisateur     = req.query.utilisateur || null;
      const date_debut      = req.query.date_debut  || null;
      const date_fin        = req.query.date_fin    || null;

      const result = await ImportLogsModel.getAll({ page, limit, formulaire_type, statut, utilisateur, date_debut, date_fin });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[import-logs] getAll:', err);
      res.status(500).json({ success: false, error: publicError(err) });
    }
  },

  async getById(req, res) {
    try {
      const log = await ImportLogsModel.getById(parseInt(req.params.id));
      if (!log) return res.status(404).json({ success: false, error: 'Log introuvable' });
      res.json({ success: true, data: log });
    } catch (err) {
      console.error('[import-logs] getById:', err);
      res.status(500).json({ success: false, error: publicError(err) });
    }
  }
};

module.exports = ImportLogsController;
