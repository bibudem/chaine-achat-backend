const ReponsesModel = require('../models/reponses');
const axios         = require('axios');

const APP_URL = process.env.APP_URL || 'http://localhost:4200';

const N8N_SUGGESTION_URL = process.env.N8N_SUGGESTION_URL
  || 'http://host.docker.internal:5678/webhook/suggestion';

const N8N_NOUVEL_ACHAT_URL = process.env.N8N_NOUVEL_ACHAT_URL
  || 'http://host.docker.internal:5678/webhook/nouvel-achat';

function redirect(res, url) {
  const decodedUrl = decodeURIComponent(url);
  res.writeHead(302, { Location: decodedUrl });
  return res.end();
}

const ReponsesController = {

  // ═══════════════════════════════════════════════════════════
  // SUGGESTION D'ACHAT
  // POST /reponses/suggestion
  // ═══════════════════════════════════════════════════════════
  async createSuggestion(req, res) {
    const { usager_nom, usager_courriel, usager_statut, reponses } = req.body;

    if (!reponses) {
      return res.status(400).json({ error: 'reponses est requis.' });
    }

    try {
      const row = await ReponsesModel.createSuggestion({
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses
      });

      // Notifier n8n /suggestion (fire-and-forget)
      axios.post(N8N_SUGGESTION_URL, {
        id:              row.id,
        type_formulaire: "Suggestion d'achat",
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses
      })
      .then(()  => console.log(`✅ [suggestion] n8n notifié — #${row.id}`))
      .catch(err => console.warn(`⚠️  [suggestion] n8n non joignable:`, err.message));

      return res.status(201).json({
        message: 'Suggestion enregistrée.',
        id:    row.id,
        dateA: row.dateA
      });

    } catch (err) {
      console.error('[suggestion] createSuggestion:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    }
  },

  // GET /reponses/decision-suggestion?id=&action=approuver|refuser&courriel_admin=
  async decisionSuggestion(req, res) {
    const { id, action, courriel_admin } = req.query;

    if (!id || !action)                             return res.status(400).send('Paramètres manquants.');
    if (!['approuver', 'refuser'].includes(action)) return res.status(400).send('Action invalide.');

    try {
      const statut  = action === 'approuver' ? 'approuve' : 'refuse';

      const reponse = await ReponsesModel.updateDecision({
        id,
        statut_approbation: statut,
        courriel_admin:     courriel_admin || null,
        commentaire_admin:  action === 'approuver'
          ? "Approuvé par l'administrateur"
          : "Refusé par l'administrateur"
      });

      if (!reponse) return res.status(404).send('Réponse introuvable.');

      let itemId = null;
      if (action === 'approuver') {
        itemId = await ReponsesModel.insererSuggestionApresApprobation(reponse);
      }

      console.log(`[suggestion] décision [${encodeURIComponent(statut)}] — #${encodeURIComponent(id)} — item_id: ${encodeURIComponent(id)}`);
      return redirect(res, `${APP_URL}/items?decision=${encodeURIComponent(statut)}&ref=${encodeURIComponent(id)}`);

    } catch (err) {
      console.error('[suggestion] decisionSuggestion:', err);
      return redirect(res, `${APP_URL}/items?decision=erreur&ref=${encodeURIComponent(id)}`);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // NOUVEL ACHAT UNIQUE
  // POST /reponses/nouvel-achat
  // ═══════════════════════════════════════════════════════════
  async createNouvelAchat(req, res) {
    const { usager_nom, usager_courriel, usager_statut, reponses } = req.body;

    if (!reponses?.baseData) {
      return res.status(400).json({ error: 'reponses.baseData est requis.' });
    }

    try {
      const row = await ReponsesModel.createNouvelAchat({
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses   // { baseData, specificData }
      });

      // Extraire baseData et specificData depuis reponses
      const baseData = reponses.baseData || {};
      const specificData = reponses.specificData || {};

      // Notifier n8n /nouvel-achat (fire-and-forget)
      const n8nPayload = {
        id:              row.id,
        type_formulaire: 'Nouvel achat unique',
        usager_nom,
        usager_courriel,
        usager_statut,
        baseData,
        specificData
      };

      console.log(`📤 [nouvel-achat] Envoi à n8n — #${row.id}`);
      console.log(`   Payload:`, JSON.stringify(n8nPayload, null, 2));

      axios.post(N8N_NOUVEL_ACHAT_URL, n8nPayload)
      .then(() => {
        console.log(`✅ [nouvel-achat] n8n notifié — #${row.id}`);
        console.log(`   baseData keys:`, Object.keys(baseData));
        console.log(`   specificData keys:`, Object.keys(specificData));
      })
      .catch(err => {
        console.error(`❌ [nouvel-achat] n8n non joignable:`, err.message);
        console.error(`   URL: ${N8N_NOUVEL_ACHAT_URL}`);
        if (err.response) {
          console.error(`   Status: ${err.response.status}`);
          console.error(`   Response:`, err.response.data);
        }
      });

      return res.status(201).json({
        message: 'Nouvel achat unique enregistré.',
        id:    row.id,
        dateA: row.dateA
      });

    } catch (err) {
      console.error('[nouvel-achat] createNouvelAchat:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    }
  },

  // GET /reponses/decision-achat?id=&action=approuver|refuser&courriel_admin=
  async decisionNouvelAchat(req, res) {
    const { id, action, courriel_admin } = req.query;

    if (!id || !action)  return res.status(400).send('Paramètres manquants : ' + JSON.stringify(req.params));
    if (!['approuver', 'refuser'].includes(action)) return res.status(400).send('Action invalide.');

    try {
      const statut  = action === 'approuver' ? 'approuve' : 'refuse';

      const reponse = await ReponsesModel.updateDecision({
        id,
        statut_approbation: statut,
        courriel_admin:     courriel_admin || null,
        commentaire_admin:  action === 'approuver'
          ? "Approuvé par l'administrateur"
          : "Refusé par l'administrateur"
      });

      if (!reponse) return res.status(404).send('Réponse introuvable.');

      let itemId = null;
      if (action === 'approuver') {
        itemId = await ReponsesModel.insererNouvelAchatApresApprobation(reponse);
      }

      console.log(`[nouvel-achat] décision [${statut}] — #${id} — item_id: ${itemId}`);
      return redirect(
                    res,
                    `${APP_URL}/items?decision=${encodeURIComponent(statut)}&ref=${encodeURIComponent(id)}`
                  );

    } catch (err) {
      console.error('[nouvel-achat] decisionNouvelAchat:', err);
      return redirect(res, `${APP_URL}/items?decision=erreur&ref=${encodeURIComponent(id)}`);
    }
  },

  // ═══════════════════════════════════════════════════════════
  
  // LECTURE (commun)
  // ═══════════════════════════════════════════════════════════
  async getAll(req, res) {
    const { type, statut, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    try {
      const { rows, total } = await ReponsesModel.findAll({ type, statut, limit, offset });
      res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      console.error('[commun] getAll:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération de toutes les réponses.' });
    }
  },

  async getById(req, res) {
    try {
      const row = await ReponsesModel.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Réponse non trouvée.' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: 'Erreur lors de la récupération.' + req.params });
    }
  }
};

module.exports = ReponsesController;