const ReponsesModel = require('../models/reponses');

const ReponsesController = {

  async create(req, res) {
    const { type_formulaire, usager_nom, usager_courriel, usager_statut, reponses } = req.body;

    if (!type_formulaire || !reponses) {
      return res.status(400).json({ error: 'type_formulaire et reponses sont requis.' });
    }

    if (!['demande', 'suggestion'].includes(type_formulaire)) {
      return res.status(400).json({ error: 'type_formulaire doit être "demande" ou "suggestion".' });
    }

    try {
      const row = await ReponsesModel.create({
        type_formulaire,
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses
      });

      res.status(201).json({
        message: 'Réponse enregistrée avec succès.',
        id: row.id,
        cree_le: row.cree_le
      });
    } catch (err) {
      console.error('Erreur DB create reponse:', err);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement.' });
    }
  },

  async getAll(req, res) {
    const { type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
      const { rows, total } = await ReponsesModel.findAll({ type, limit, offset });

      res.json({
        data: rows,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    } catch (err) {
      console.error('Erreur DB getAll reponses:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération.' });
    }
  },

  async getById(req, res) {
    try {
      const row = await ReponsesModel.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Réponse non trouvée.' });
      res.json(row);
    } catch (err) {
      console.error('Erreur DB getById reponse:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération.' });
    }
  }
};

module.exports = ReponsesController;