const ReponsesModel = require('../models/reponses');
const { publicError } = require('../util/errors');
const config         = require('../config/config');
const UtilisateursModel = require('../models/utilisateurs');
const { posterN8n, notifierEvenement } = require('../util/notifications-n8n');

// Statut par défaut d'une suggestion envoyée par la communauté UdeM (/suggestion-public).
const STATUT_SUGGESTION_RECUE = 'Suggestion d’achat reçue';

// Compléter une suggestion publique et la soumettre aux ACQ : équipe de tri + Admin.
const ROLES_COMPLETER_SUGGESTION = ['TechDoc', 'Admin', 'SuperAdmin'];
// Champs « TechDoc Tri » (transmise en bibliothèque, notes) : équipe de tri seulement (le
// SuperAdmin hérite de tous les accès).
const ROLES_SUIVI_TRI = ['TechDoc', 'SuperAdmin'];

const APP_URL = process.env.APP_URL || 'http://localhost:4200';

const N8N_SUGGESTION_URL          = config.n8n.suggestionUrl;
const N8N_NOUVEL_ACHAT_URL        = config.n8n.nouvelAchatUrl;
const N8N_NOUVEL_ABONNEMENT_URL   = config.n8n.nouvelAbonnementUrl;
const N8N_MODIFICATION_CCOL_URL   = config.n8n.modificationCcolUrl;
const N8N_PEB_TIPASA_URL          = config.n8n.pebTipasaUrl;
const N8N_REQUETE_ACQ_URL         = config.n8n.requeteAcqUrl;
const N8N_SPRINGER_URL            = config.n8n.springerUrl;
const N8N_TRI_DECISION_URL        = config.n8n.triDecisionUrl;
const N8N_SUGGESTION_PUBLIQUE_URL = config.n8n.suggestionPubliqueUrl;

function redirect(res, url) {
  const decodedUrl = decodeURIComponent(url);
  res.writeHead(302, { Location: decodedUrl });
  return res.end();
}

// Matérialise immédiatement l'item dans tbl_items (au lieu d'attendre l'ouverture de la
// notification) afin que la demande soit visible tout de suite dans Recherche/Rapport,
// avec ses valeurs par défaut (statut_bibliotheque/statut_acq). Non bloquant : si ça échoue,
// l'item sera quand même créé plus tard via le mécanisme existant (ouverture de la notification).
//
// Volontairement limité aux demandes déjà soumises aux ACQ (statut_bibliotheque =
// "Soumettre aux ACQ") : au-delà de ce statut, l'édition du brouillon est bloquée côté
// tbl_reponses (voir ReponsesModel.updateReponses), donc l'item matérialisé ne peut plus
// diverger. Un brouillon encore "Saisie en cours…" reste non matérialisé, comme avant,
// pour ne pas désynchroniser tbl_items si l'usager continue de le modifier (updateReponse
// ne met à jour que tbl_reponses, jamais l'item déjà créé).
function _estSoumise(baseData) {
  return baseData?.statut_bibliotheque === 'Soumettre aux ACQ';
}

async function _materialiserItem(reponseId, baseData, logKey) {
  if (!_estSoumise(baseData)) return null;
  try {
    const itemId = await ReponsesModel.creerItemDepuisReponse(reponseId);
    console.log(`✅ [${logKey}] item créé immédiatement — réponse #${reponseId} → item #${itemId}`);
    return itemId;
  } catch (err) {
    console.error(`⚠️  [${logKey}] création immédiate de l'item échouée pour la réponse #${reponseId}:`, err.message);
    return null;
  }
}

async function _creerFormulaire(req, res, typeFormulaire, n8nUrl, logKey) {
  const { usager_nom, usager_courriel, usager_statut, reponses } = req.body;
  if (!reponses?.baseData) return res.status(400).json({ error: 'reponses.baseData est requis.' });
  try {
    const row = await ReponsesModel.createFormulaire({
      type_formulaire: typeFormulaire, usager_nom, usager_courriel, usager_statut, reponses
    });
    const { baseData = {}, specificData = {} } = reponses;
    const itemId = await _materialiserItem(row.id, baseData, logKey);
    // Courriels (ACQ + accusé de réception) seulement pour une demande soumise aux ACQ : un
    // brouillon les déclenchera à sa soumission (voir patchReponses).
    if (_estSoumise(baseData)) {
      await posterN8n(n8nUrl, logKey, row.id, {
        id: row.id, item_id: itemId, type_formulaire: typeFormulaire,
        usager_nom, usager_courriel, usager_statut, baseData, specificData
      });
    }
    return res.status(201).json({ message: `${typeFormulaire} enregistré.`, id: row.id, dateA: row.dateA, item_id: itemId });
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

      // Suggestion est en format plat (pas de baseData/specificData) : statut_bibliotheque
      // est directement sur `reponses` — même mécanisme que les 5 autres types de formulaire
      // (voir _materialiserItem, plus haut) pour matérialiser l'item dès la soumission si
      // "Soumettre aux ACQ" est déjà choisi.
      const itemId = await _materialiserItem(row.id, reponses, 'suggestion');

      // Notifier n8n /suggestion (attendu : voir posterN8n) — seulement si soumise aux ACQ ; un
      // brouillon est notifié à sa soumission (voir patchReponses).
      if (_estSoumise(reponses)) {
        await posterN8n(N8N_SUGGESTION_URL, 'suggestion', row.id, {
          id:              row.id,
          item_id:         itemId,
          type_formulaire: "Suggestion d'achat - Usager",
          usager_nom,
          usager_courriel,
          usager_statut,
          reponses
        });
      }

      return res.status(201).json({
        message: 'Suggestion enregistrée.',
        id:      row.id,
        dateA:   row.dateA,
        item_id: itemId
      });

    } catch (err) {
      console.error('[suggestion] createSuggestion:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SUGGESTION PUBLIQUE (communauté UdeM, formulaire /suggestion-public)
  // POST /reponses/suggestion-publique — requireAuth
  // L'identité vient du JWT, jamais du corps de la requête : c'est elle qui recevra les
  // courriels de décision (tri, puis ACQ). Pas d'item ni de courriel aux ACQ ici : la demande
  // attend d'abord le tri de l'équipe TechDoc (voir decisionTri).
  // ═══════════════════════════════════════════════════════════
  async createSuggestionPublique(req, res) {
    const { usager_statut, reponses } = req.body;
    if (!reponses) return res.status(400).json({ error: 'reponses est requis.' });

    const usager_nom      = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const usager_courriel = req.user.email;
    if (!usager_courriel) return res.status(400).json({ error: 'Courriel introuvable dans la session.' });

    try {
      const row = await ReponsesModel.createSuggestionPublique({
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses: {
          ...reponses,
          demandeur:           usager_nom,
          usager_nom,
          usager_courriel,
          // Statut par défaut d'une suggestion publique, en attente du tri TechDoc (même valeur
          // que STATUT_SUGGESTION_RECUE côté frontend, lib/ListeChoixOptions.ts).
          statut_bibliotheque: STATUT_SUGGESTION_RECUE,
        }
      });

      // n8n /suggestion-publique (attendu : voir posterN8n) : accusé de réception au demandeur +
      // notification à l'équipe TechDoc. Pas le webhook /suggestion, qui écrit aux ACQ — ils
      // ne sont concernés qu'une fois la suggestion acceptée puis soumise.
      const techdocCourriels = await UtilisateursModel.courrielsParRole('TechDoc')
        .catch(err => { console.error('[suggestion-publique] courriels TechDoc:', err.message); return []; });
      await posterN8n(N8N_SUGGESTION_PUBLIQUE_URL, 'suggestion-publique', row.id, {
        id:               row.id,
        type_formulaire:  "Suggestion d'achat - Usager",
        source:           'publique',
        usager_nom,
        usager_courriel,
        usager_statut,
        reponses,
        techdoc_courriels: techdocCourriels,
      });

      return res.status(201).json({ message: 'Suggestion enregistrée.', id: row.id, dateA: row.dateA });
    } catch (err) {
      console.error('[suggestion-publique] create:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TRI DES SUGGESTIONS PUBLIQUES (équipe TechDoc)
  // GET /reponses/tri?statut=a_trier|a_completer|soumise|refuse&search=&limit=&offset=
  // ═══════════════════════════════════════════════════════════
  async listTri(req, res) {
    const STATUTS_VALIDES = ['a_trier', 'a_completer', 'soumise', 'refuse'];
    try {
      const limit  = Math.min(Math.max(parseInt(req.query.limit)  || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const statut = STATUTS_VALIDES.includes(req.query.statut) ? req.query.statut : null;
      const [result, aTrier] = await Promise.all([
        ReponsesModel.findTri({
          statut, limit, offset,
          ordre: ['date_desc', 'date_asc'].includes(req.query.ordre) ? req.query.ordre : null,
          search: req.query.search || null,
        }),
        ReponsesModel.countATrier(),
      ]);
      res.json({ ...result, a_trier: aTrier });
    } catch (err) {
      console.error('[tri] listTri:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des suggestions.' });
    }
  },

  // PUT /reponses/:id/tri  { decision: 'accepte'|'refuse', commentaire }
  // Le commentaire est obligatoire en cas de refus ; il est alors transmis au demandeur dans
  // le courriel de refus (n8n /tri-decision). Une acceptation n'envoie pas de courriel.
  async decisionTri(req, res) {
    const { id } = req.params;
    const decision    = req.body?.decision;
    const commentaire = (req.body?.commentaire || '').trim() || null;
    // Suivi interne de l'équipe TechDoc — saisi en même temps que la décision de tri (voir
    // tri-suggestions.component.ts), reporté dans tbl_reponses.reponses pour suivre la
    // suggestion même si elle n'est pas (encore) matérialisée en item.
    // Réservé à l'équipe de tri : ignoré quand un Admin rend la décision (supervision).
    const suiviTri = ROLES_SUIVI_TRI.includes(req.user?.role);
    const techdocSuggestionTransmise = suiviTri && !!req.body?.techdoc_suggestion_transmise;
    const techdocTriNotes            = suiviTri ? ((req.body?.techdoc_tri_notes || '').trim() || null) : null;

    if (!['accepte', 'refuse'].includes(decision)) {
      return res.status(400).json({ error: "Décision invalide (attendu : 'accepte' ou 'refuse')." });
    }
    if (decision === 'refuse' && !commentaire) {
      return res.status(400).json({ error: 'Un commentaire est obligatoire pour refuser une suggestion.' });
    }
    if (commentaire && commentaire.length > 2000) {
      return res.status(400).json({ error: 'Le commentaire ne doit pas dépasser 2000 caractères.' });
    }
    if (techdocTriNotes && techdocTriNotes.length > 2000) {
      return res.status(400).json({ error: 'Les notes TechDoc ne doivent pas dépasser 2000 caractères.' });
    }

    try {
      const parNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || req.user.email;
      const { updated, existant } = await ReponsesModel.decisionTri({
        id, decision, commentaire, par: req.user.email, parNom,
        techdocSuggestionTransmise, techdocTriNotes,
      });

      if (!updated) {
        if (!existant) return res.status(404).json({ error: 'Suggestion introuvable.' });
        if (!existant.tri_statut) return res.status(400).json({ error: "Cette demande n'est pas une suggestion publique." });
        return res.status(409).json({
          error: `Cette suggestion a déjà été traitée${existant.tri_par_nom ? ` par ${existant.tri_par_nom}` : ''}.`,
          tri_statut: existant.tri_statut,
        });
      }

      // Refus seulement : le demandeur est avisé tout de suite. Une suggestion acceptée ne
      // déclenche aucun courriel au demandeur à cette étape — les ACQ sont avisés quand elle
      // leur est soumise (événement 'suggestion-soumise-acq', voir patchReponses), puis le
      // demandeur et l'équipe de tri reçoivent la confirmation de fin de traitement des ACQ.
      if (decision === 'refuse') {
        const data = typeof updated.reponses === 'string' ? JSON.parse(updated.reponses) : (updated.reponses || {});
        await posterN8n(N8N_TRI_DECISION_URL, 'tri-decision', updated.id, {
          reponse_id:      updated.id,
          type_formulaire: "Suggestion d'achat - Usager",
          decision,
          commentaire,
          usager_nom:      updated.usager_nom,
          usager_courriel: updated.usager_courriel,
          titre_document:  data.titre_document || null,
          auteur:          data.auteur || null,
        });
      }

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('[tri] decisionTri:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement de la décision." });
    }
  },

  // PUT /reponses/:id/techdoc-transmise — étape de fin d'une suggestion pas encore
  // matérialisée en item (sinon PUT /items/:id/techdoc-transmise). Admin/SuperAdmin.
  async majTechdocTransmise(req, res) {
    const id        = Number(req.params.id);
    const transmise = req.body?.techdoc_suggestion_transmise;
    if (!Number.isInteger(id) || typeof transmise !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Paramètres invalides.' });
    }
    try {
      const updated = await ReponsesModel.majTechdocTransmise(id, transmise);
      if (!updated) return res.status(404).json({ success: false, error: 'Suggestion introuvable.' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('[techdoc] majTechdocTransmise:', err);
      return res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement." });
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

      const itemId = await _materialiserItem(row.id, baseData, 'nouvel-achat');

      // Notifier n8n /nouvel-achat (attendu : voir posterN8n) — seulement si soumise aux ACQ ;
      // un brouillon est notifié à sa soumission (voir patchReponses).
      if (_estSoumise(baseData)) {
        await posterN8n(N8N_NOUVEL_ACHAT_URL, 'nouvel-achat', row.id, {
          id:              row.id,
          item_id:         itemId,
          type_formulaire: 'Nouvel achat unique',
          usager_nom,
          usager_courriel,
          usager_statut,
          baseData,
          specificData
        });
      }

      return res.status(201).json({
        message: 'Nouvel achat unique enregistré.',
        id:      row.id,
        dateA:   row.dateA,
        item_id: itemId
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
    return _creerFormulaire(req, res, 'Requête ACQ Accessibilité', N8N_REQUETE_ACQ_URL, 'requete-acq');
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
        } else if (type === "Suggestion d'achat - Usager") {
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
        } else if (type === "Suggestion d'achat - Usager") {
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
        courriel: reponse.usager_courriel || base.personne_a_aviser_courriel || '',
        titre:    base.titre_document     || 'Sans titre'
      });

    } catch (err) {
      console.error('[decisionApi]', err);
      return res.status(500).json({ success: false, error: publicError(err) });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CRÉER L'ITEM DEPUIS UNE RÉPONSE
  // POST /reponses/:id/creer-item
  // Idempotent — retourne l'item_id existant si déjà créé.
  // ═══════════════════════════════════════════════════════════
  async creerItem(req, res) {
    const reponseId = parseInt(req.params.id, 10);
    if (!reponseId) return res.status(400).json({ success: false, error: 'id invalide.' });
    try {
      const itemId = await ReponsesModel.creerItemDepuisReponse(reponseId);
      res.json({ success: true, item_id: itemId, reponse_id: reponseId });
    } catch (err) {
      console.error('[creerItem]', err.message);
      res.status(500).json({ success: false, error: publicError(err) });
    }
  },

  // ═══════════════════════════════════════════════════════════

  // LECTURE (commun)
  // ═══════════════════════════════════════════════════════════

  // GET /reponses/pending — réponses sans décision ACQ (item_id_cree IS NULL)
  async getByEmail(req, res) {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Paramètre email requis.' });
    try {
      const rows = await ReponsesModel.findByEmail(email);
      res.json({ data: rows });
    } catch (err) {
      console.error('[profil] getByEmail:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des demandes.' });
    }
  },

  // GET /reponses/public — toutes les demandes du système, en lecture seule (profil Usager).
  // Voir ReponsesModel.findAllPublic : ne renvoie volontairement aucune information
  // personnelle (nom/courriel du demandeur), financière, ou note interne.
  async getAllPublic(req, res) {
    try {
      const limit  = Math.min(Math.max(parseInt(req.query.limit)  || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const { search, type_formulaire, bibliotheque, dateDebut, dateFin, statut } = req.query;
      const result = await ReponsesModel.findAllPublic({
        limit, offset,
        search:           search           || null,
        type_formulaire:  type_formulaire  || null,
        bibliotheque:     bibliotheque      || null,
        dateDebut:        dateDebut         || null,
        dateFin:          dateFin           || null,
        statut:           statut            || null,
      });
      res.json(result);
    } catch (err) {
      console.error('[public] getAllPublic:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des demandes.' });
    }
  },

  async getPending(req, res) {
    const limit        = Math.min(parseInt(req.query.limit) || 5, 20);
    const statut_field = req.query.statut_field || null;
    const statut_value = req.query.statut_value || null;
    try {
      const result = await ReponsesModel.getPending(limit, statut_field, statut_value);
      res.json(result);
    } catch (err) {
      console.error('[pending] getPending:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des réponses en attente.' });
    }
  },

  async getAll(req, res) {
    const { type, statut, suivi_acq, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    try {
      const { rows, total } = await ReponsesModel.findAll({ type, statut, suivi_acq, limit, offset });
      res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      console.error('[commun] getAll:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération de toutes les réponses.' });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SUPPRESSION PAR L'USAGER
  // DELETE /reponses/:id
  // Autorisé uniquement si aucun avis ACQ n'est encore pris.
  // ═══════════════════════════════════════════════════════════
  async supprimer(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'id invalide.' });
    try {
      const deleted = await ReponsesModel.deleteById(id);
      if (!deleted) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
      return res.status(204).send();
    } catch (err) {
      console.error('[supprimer]', err);
      return res.status(500).json({ error: 'Erreur lors de la suppression.' });
    }
  },

  async getById(req, res) {
    try {
      const row = await ReponsesModel.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Réponse non trouvée.' });
      // Normaliser reponses : toujours envoyer un objet au frontend (la colonne peut être TEXT)
      if (typeof row.reponses === 'string') {
        try { row.reponses = JSON.parse(row.reponses); } catch (e) { row.reponses = {}; }
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: 'Erreur lors de la récupération.' });
    }
  },

  async patchReponses(req, res) {
    const { id } = req.params;
    const { reponses } = req.body;
    if (!reponses) return res.status(400).json({ error: 'Corps requis : { reponses }' });
    try {
      // État avant modification : sert à détecter qu'une suggestion publique acceptée vient
      // d'être soumise aux ACQ (item pas encore créé avant cet appel).
      const avant = await ReponsesModel.findById(id);

      // Suggestion publique : seules l'équipe de tri et les Admin la complètent et la soumettent
      // aux ACQ ; les autres rôles n'y ont accès qu'en lecture.
      const role = req.user?.role;
      if (avant?.tri_statut && !ROLES_COMPLETER_SUGGESTION.includes(role)) {
        return res.status(403).json({ error: 'Seules l\'équipe de tri et les Admin peuvent modifier une suggestion publique.' });
      }
      // Champs « TechDoc Tri » : réservés à l'équipe de tri — on conserve les valeurs existantes
      // pour tout autre rôle (Suggestion d'achat, format plat).
      if (!ROLES_SUIVI_TRI.includes(role)) {
        const prec = typeof avant?.reponses === 'string' ? JSON.parse(avant.reponses) : (avant?.reponses || {});
        for (const champ of ['techdoc_suggestion_transmise', 'techdoc_tri_notes']) {
          if (champ in reponses || champ in prec) reponses[champ] = prec[champ] ?? null;
        }
      }

      const updated = await ReponsesModel.updateReponses(id, reponses);
      if (!updated) return res.status(403).json({ error: 'Modification non autorisée ou demande introuvable.' });
      // Une demande déjà existante (brouillon) qu'on bascule à "Soumettre aux ACQ" lors d'une
      // modification doit elle aussi être matérialisée immédiatement, comme à la création.
      // Suggestion d'achat est en format plat (pas de reponses.baseData) — statut_bibliotheque
      // est alors directement sur reponses.
      const itemId = await _materialiserItem(id, reponses.baseData || reponses, 'patch-reponses');

      // Suggestion publique acceptée par TechDoc, soumise aux ACQ à l'instant : les ACQ en sont
      // avisés (BAL ACQ). Ils n'avaient reçu aucun courriel à l'envoi initial — la suggestion
      // passait d'abord par le tri.
      if (itemId && avant && avant.tri_statut === 'accepte' && !avant.item_id_cree) {
        await notifierEvenement('suggestion-soumise-acq', id, {
          id:              Number(id),
          item_id:         itemId,
          type_formulaire: avant.type_formulaire,
          usager_nom:      avant.usager_nom,
          usager_courriel: avant.usager_courriel,
          usager_statut:   avant.usager_statut,
          tri_par_nom:     avant.tri_par_nom,
          reponses,
        });
      } else if (itemId && avant && !avant.tri_statut && !avant.item_id_cree) {
        // Brouillon interne soumis aux ACQ à l'instant : mêmes courriels qu'une demande soumise
        // dès sa création (BAL ACQ + accusé de réception à la personne qui l'a saisie).
        await notifierEvenement('demande-soumise-acq', id, {
          id:              Number(id),
          item_id:         itemId,
          type_formulaire: avant.type_formulaire,
          usager_nom:      avant.usager_nom,
          usager_courriel: avant.usager_courriel,
          usager_statut:   avant.usager_statut,
          reponses,
        });
      }

      res.json({ success: true, item_id: itemId });
    } catch (err) {
      console.error('[patchReponses]', err);
      res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
    }
  }
};

module.exports = ReponsesController;