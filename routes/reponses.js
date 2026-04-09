const express            = require('express');
const router             = express.Router();
const ReponsesController = require('../controllers/reponses');

// ─────────────────────────────────────────────────────────────
// SUGGESTION D'ACHAT
// ─────────────────────────────────────────────────────────────
router.post('/suggestion',          ReponsesController.createSuggestion);
router.get('/decision-suggestion',  ReponsesController.decisionSuggestion);

// ─────────────────────────────────────────────────────────────
// NOUVEL ACHAT UNIQUE
// ─────────────────────────────────────────────────────────────
router.post('/nouvel-achat',        ReponsesController.createNouvelAchat);
router.get('/decision-achat',       ReponsesController.decisionNouvelAchat);

// ─────────────────────────────────────────────────────────────
// LECTURE (commun)
// ─────────────────────────────────────────────────────────────
router.get('/',                     ReponsesController.getAll);
router.get('/:id',                  ReponsesController.getById);

module.exports = router;