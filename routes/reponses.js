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
router.post('/requete-acq',         ReponsesController.createRequeteAcq);

// ─────────────────────────────────────────────────────────────
// SPRINGER
// ─────────────────────────────────────────────────────────────
router.post('/springer',            ReponsesController.createSpringer);

// ─────────────────────────────────────────────────────────────
// DÉCISION GÉNÉRIQUE (nouveaux types)
// GET /reponses/decision?id=&action=approuver|refuser&courriel_admin=
// ─────────────────────────────────────────────────────────────
router.get('/decision',             ReponsesController.decisionFormulaire);

// ─────────────────────────────────────────────────────────────
// LECTURE (commun)
// ─────────────────────────────────────────────────────────────
router.get('/',                     ReponsesController.getAll);
router.get('/:id',                  ReponsesController.getById);

module.exports = router;