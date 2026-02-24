const ReponsesModel = require('../models/reponses');
const axios = require('axios');

const APP_URL = process.env.APP_URL || 'http://localhost:4200';

const ReponsesController = {

  async create(req, res) {
    const { type_formulaire, usager_nom, usager_courriel, usager_statut, reponses } = req.body;
    if (!type_formulaire || !reponses) {
      return res.status(400).json({ error: 'type_formulaire et reponses sont requis.' });
    }
    try {
      const row = await ReponsesModel.create({
        type_formulaire, usager_nom, usager_courriel, usager_statut, reponses
      });

      const N8N_URL = process.env.N8N_WEBHOOK_URL
        || 'http://host.docker.internal:5678/webhook/nouvelle-demande';

      axios.post(N8N_URL, {
        id: row.id,
        type_formulaire,
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses
      })
      .then(() => console.log(`n8n notifié pour la demande #${row.id}`))
      .catch(err => console.warn('⚠️ n8n non joignable:', err.message));

      res.status(201).json({ message: 'Réponse enregistrée.', id: row.id, dateA: row.dateA });

    } catch (err) {
      console.error('Erreur create reponse:', err);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement.' });
    }
  },

  // ── Appelé directement par le bouton du courriel admin ──
 async decision(req, res) {
  const { id, action, courriel_admin } = req.query;

  if (!id || !action) return res.status(400).send('Paramètres manquants.');
  if (!['approuver', 'refuser'].includes(action)) return res.status(400).send('Action invalide.');

  try {
    const statut = action === 'approuver' ? 'approuve' : 'refuse';

    const reponse = await ReponsesModel.updateDecision({
      id,
      statut_approbation: statut,
      courriel_admin: courriel_admin || null,
      commentaire_admin: action === 'approuver'
        ? 'Approuvé par l\'administrateur'
        : 'Refusé par l\'administrateur'
    });

    if (!reponse) return res.status(404).send('Réponse introuvable.');

    let itemId = null;
    if (action === 'approuver') {
      itemId = await ReponsesModel.insererApresApprobation(reponse);
    }

    console.log(`Décision [${statut}] enregistrée pour demande #${id} — item_id: ${itemId}`);

    // ✅ Redirection manuelle sans encodage
    const APP_URL = process.env.APP_URL || 'http://localhost:4200';
    const url = `${APP_URL}/items?decision=${statut}&ref=${id}`;
    
    res.writeHead(302, { 'Location': url });
    return res.end();

  } catch (err) {
    console.error('Erreur decision reponse:', err);
    const APP_URL = process.env.APP_URL || 'http://localhost:4200';
    res.writeHead(302, { 'Location': `${APP_URL}/items?decision=erreur&ref=${id}` });
    return res.end();
  }
},

  async getAll(req, res) {
    const { type, statut, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    try {
      const { rows, total } = await ReponsesModel.findAll({ type, statut, limit, offset });
      res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      console.error('Erreur getAll reponses:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération.' });
    }
  },

  async getById(req, res) {
    try {
      const row = await ReponsesModel.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Réponse non trouvée.' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: 'Erreur lors de la récupération.' });
    }
  }
};

module.exports = ReponsesController;