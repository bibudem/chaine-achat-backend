const ImportLogsModel = require('../models/import-logs');

const ImportLogsController = {

  async getAll(req, res) {
    try {
      const page           = Math.max(1, parseInt(req.query.page)  || 1);
      const limit          = Math.min(100, parseInt(req.query.limit) || 20);
      const formulaire_type = req.query.type   || null;
      const statut          = req.query.statut || null;

      const result = await ImportLogsModel.getAll({ page, limit, formulaire_type, statut });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[import-logs] getAll:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const log = await ImportLogsModel.getById(parseInt(req.params.id));
      if (!log) return res.status(404).json({ success: false, error: 'Log introuvable' });
      res.json({ success: true, data: log });
    } catch (err) {
      console.error('[import-logs] getById:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

module.exports = ImportLogsController;
