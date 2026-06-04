const express            = require('express');
const router             = express.Router();
const ReponsesController = require('../controllers/reponses');

// ─────────────────────────────────────────────────────────────
// SUGGESTION D'ACHAT
// ─────────────────────────────────────────────────────────────
router.post('/suggestion',          ReponsesController.createSuggestion);
router.get('/suggestion_usagers',  ReponsesController.decisionSuggestion);

// ─────────────────────────────────────────────────────────────
// NOUVEL ACHAT UNIQUE
// ─────────────────────────────────────────────────────────────
router.post('/nouvel-achat',        ReponsesController.createNouvelAchat);
router.get('/decision-achat',       ReponsesController.decisionNouvelAchat);

// ─────────────────────────────────────────────────────────────
// NOUVEL ABONNEMENT
// ─────────────────────────────────────────────────────────────
router.post('/nouvel-abonnement',   ReponsesController.createNouvelAbonnement);

// ─────────────────────────────────────────────────────────────
// MODIFICATION CCOL
// ─────────────────────────────────────────────────────────────
router.post('/modification-ccol',   ReponsesController.createModificationCcol);

// ─────────────────────────────────────────────────────────────
// PEB TIPASA NUMÉRIQUE
// ─────────────────────────────────────────────────────────────
router.post('/peb-tipasa',          ReponsesController.createPebTipasa);

// ─────────────────────────────────────────────────────────────
// REQUÊTE ACQ
// ─────────────────────────────────────────────────────────────
router.post('/requete-accessibilite', ReponsesController.createRequeteAcq);

// ─────────────────────────────────────────────────────────────
// DÉCISION GÉNÉRIQUE (nouveaux types)
// GET /reponses/decision?id=&action=approuver|refuser&courriel_admin=
// ─────────────────────────────────────────────────────────────
router.get('/decision',             ReponsesController.decisionFormulaire);

// ─────────────────────────────────────────────────────────────
// CRÉER L'ITEM DEPUIS UNE RÉPONSE (idempotent)
// POST /reponses/:id/creer-item
// ─────────────────────────────────────────────────────────────
router.post('/:id/creer-item',      ReponsesController.creerItem);

// ─────────────────────────────────────────────────────────────
// DÉCISION API JSON (pour n8n)
// PUT /reponses/:id/decision
// ─────────────────────────────────────────────────────────────
router.put('/:id/decision',         ReponsesController.decisionApi);

// ─────────────────────────────────────────────────────────────
// LECTURE (commun)
// ─────────────────────────────────────────────────────────────
router.get('/pending',              ReponsesController.getPending);
router.get('/profil',               ReponsesController.getByEmail);
router.get('/',                     ReponsesController.getAll);
router.get('/:id',                  ReponsesController.getById);
router.delete('/:id',               ReponsesController.supprimer);

module.exports = router;