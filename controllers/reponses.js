const ReponsesModel = require('../models/reponses');
const axios         = require('axios');

const APP_URL = process.env.APP_URL || 'http://localhost:4200';

const PROD_BASE = 'https://ordo.bib.umontreal.ca/webhook';

const N8N_SUGGESTION_URL          = process.env.N8N_SUGGESTION_URL          || `${PROD_BASE}/suggestion`;
const N8N_NOUVEL_ACHAT_URL        = process.env.N8N_NOUVEL_ACHAT_URL        || `${PROD_BASE}/nouvel-achat`;
const N8N_NOUVEL_ABONNEMENT_URL   = process.env.N8N_NOUVEL_ABONNEMENT_URL   || `${PROD_BASE}/nouvel-abonnement`;
const N8N_MODIFICATION_CCOL_URL   = process.env.N8N_MODIFICATION_CCOL_URL   || `${PROD_BASE}/modification-ccol`;
const N8N_PEB_TIPASA_URL          = process.env.N8N_PEB_TIPASA_URL          || `${PROD_BASE}/peb-tipasa-numerique`;
const N8N_REQUETE_ACQ_URL         = process.env.N8N_REQUETE_ACQ_URL         || `${PROD_BASE}/requete-acq`;
const N8N_SPRINGER_URL            = process.env.N8N_SPRINGER_URL            || `${PROD_BASE}/springer`;

function redirect(res, url) {
  const decodedUrl = decodeURIComponent(url);
  res.writeHead(302, { Location: decodedUrl });
  return res.end();
}

function _notifierN8n(url, logKey, rowId, payload) {
  axios.post(url, payload)
    .then(() => console.log(`✅ [${logKey}] n8n notifié — #${rowId}`))
    .catch(err => {
      console.error(`❌ [${logKey}] n8n non joignable:`, err.message);
      if (err.response) console.error(`   Status: ${err.response.status}`);
    });
}

async function _creerFormulaire(req, res, typeFormulaire, n8nUrl, logKey) {
  const { usager_nom, usager_courriel, usager_statut, reponses } = req.body;
  if (!reponses?.baseData) return res.status(400).json({ error: 'reponses.baseData est requis.' });
  try {
    const row = await ReponsesModel.createFormulaire({
      type_formulaire: typeFormulaire, usager_nom, usager_courriel, usager_statut, reponses
    });
    const { baseData = {}, specificData = {} } = reponses;
    _notifierN8n(n8nUrl, logKey, row.id, {
      id: row.id, type_formulaire: typeFormulaire,
      usager_nom, usager_courriel, usager_statut, baseData, specificData
    });
    return res.status(201).json({ message: `${typeFormulaire} enregistré.`, id: row.id, dateA: row.dateA });
  } catch (err) {
    console.error(`[${logKey}] create:`, err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
  }
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

      let itemId = reponse.item_id_cree || null;
      if (action === 'approuver' && !reponse.item_id_cree) {
        itemId = await ReponsesModel.insererSuggestionApresApprobation(reponse);
      }

      console.log(`[suggestion] décision [${encodeURIComponent(statut)}] — #${encodeURIComponent(id)} — item_id: ${itemId}`);
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

      let itemId = reponse.item_id_cree || null;
      if (action === 'approuver' && !reponse.item_id_cree) {
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
  // NOUVEAUX TYPES DE FORMULAIRES
  // POST /reponses/nouvel-abonnement
  // POST /reponses/modification-ccol
  // POST /reponses/peb-tipasa
  // POST /reponses/requete-acq
  // POST /reponses/springer
  // ═══════════════════════════════════════════════════════════

  async createNouvelAbonnement(req, res) {
    return _creerFormulaire(req, res, 'Nouvel abonnement', N8N_NOUVEL_ABONNEMENT_URL, 'nouvel-abonnement');
  },

  async createModificationCcol(req, res) {
    return _creerFormulaire(req, res, 'Modification et CCOL', N8N_MODIFICATION_CCOL_URL, 'modification-ccol');
  },

  async createPebTipasa(req, res) {
    return _creerFormulaire(req, res, 'PEB Tipasa numérique', N8N_PEB_TIPASA_URL, 'peb-tipasa');
  },

  async createRequeteAcq(req, res) {
    return _creerFormulaire(req, res, 'Requête ACQ', N8N_REQUETE_ACQ_URL, 'requete-acq');
  },

  async createSpringer(req, res) {
    return _creerFormulaire(req, res, 'Springer', N8N_SPRINGER_URL, 'springer');
  },

  // GET /reponses/decision?id=&action=approuver|refuser&courriel_admin=
  async decisionFormulaire(req, res) {
    const { id, action, courriel_admin } = req.query;
    if (!id || !action) return res.status(400).send('Paramètres manquants.');
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
      let itemId = reponse.item_id_cree || null;
      if (action === 'approuver' && !reponse.item_id_cree) {
        const type = reponse.type_formulaire;
        if (type === 'Nouvel achat unique') {
          itemId = await ReponsesModel.insererNouvelAchatApresApprobation(reponse);
        } else if (type === "Suggestion d'achat") {
          itemId = await ReponsesModel.insererSuggestionApresApprobation(reponse);
        } else {
          itemId = await ReponsesModel.insererApresApprobation(reponse);
        }
      }
      console.log(`[${reponse.type_formulaire}] décision [${statut}] — #${id} — item_id: ${itemId}`);
      return redirect(res, `${APP_URL}/items?decision=${encodeURIComponent(statut)}&ref=${encodeURIComponent(id)}`);
    } catch (err) {
      console.error('[decisionFormulaire]:', err);
      return redirect(res, `${APP_URL}/items?decision=erreur&ref=${encodeURIComponent(id)}`);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DÉCISION API — JSON (pour n8n, pas de redirect navigateur)
  // PUT /reponses/:id/decision
  // Body : { action: "approuver"|"refuser", courriel_admin: "..." }
  // ═══════════════════════════════════════════════════════════
  async decisionApi(req, res) {
    const { id } = req.params;
    const { action, courriel_admin } = req.body;

    if (!id || !action)
      return res.status(400).json({ success: false, error: 'Paramètres manquants (id, action).' });
    if (!['approuver', 'refuser'].includes(action))
      return res.status(400).json({ success: false, error: 'Action invalide.' });

    try {
      const statut = action === 'approuver' ? 'approuve' : 'refuse';

      const reponse = await ReponsesModel.updateDecision({
        id,
        statut_approbation: statut,
        courriel_admin:     courriel_admin || null,
        commentaire_admin:  action === 'approuver'
          ? "Approuvé par l'administrateur"
          : "Refusé par l'administrateur"
      });

      if (!reponse)
        return res.status(404).json({ success: false, error: 'Réponse introuvable.' });

      let itemId = reponse.item_id_cree || null;
      if (action === 'approuver' && !reponse.item_id_cree) {
        const type = reponse.type_formulaire;
        if (type === 'Nouvel achat unique') {
          itemId = await ReponsesModel.insererNouvelAchatApresApprobation(reponse);
        } else if (type === "Suggestion d'achat") {
          itemId = await ReponsesModel.insererSuggestionApresApprobation(reponse);
        } else {
          itemId = await ReponsesModel.insererApresApprobation(reponse);
        }
      }

      const raw  = reponse.reponses;
      const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      const base = data.baseData || data;

      return res.json({
        success: true,
        statut,
        itemId,
        nom:      reponse.usager_nom      || base.demandeur                    || '',
        courriel: reponse.usager_courriel || base.personne_a_aviser_activation || '',
        titre:    base.titre_document     || 'Sans titre'
      });

    } catch (err) {
      console.error('[decisionApi]', err);
      return res.status(500).json({ success: false, error: err.message });
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