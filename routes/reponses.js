const express             = require('express');
const router              = express.Router();
const ReponsesController  = require('../controllers/reponses');
const PiecesJointesController = require('../controllers/pieces-jointes');
const { requireAuth, requireRole } = require('../middleware/jwt.middleware');

// Équipe de tri des suggestions publiques — Admin/SuperAdmin aussi, pour la supervision.
const ROLES_TRI = ['TechDoc', 'Admin', 'SuperAdmin'];

// ─────────────────────────────────────────────────────────────
// SUGGESTION D'ACHAT
// ─────────────────────────────────────────────────────────────
router.post('/suggestion',          ReponsesController.createSuggestion);
router.get('/suggestion_usagers',  ReponsesController.decisionSuggestion);

// ─────────────────────────────────────────────────────────────
// SUGGESTION PUBLIQUE (communauté UdeM) + TRI PAR L'ÉQUIPE TECHDOC
// Déclarées avant les routes génériques /:id plus bas.
// ─────────────────────────────────────────────────────────────
router.post('/suggestion-publique', requireAuth, ReponsesController.createSuggestionPublique);
router.get('/tri',                  requireAuth, requireRole(...ROLES_TRI), ReponsesController.listTri);
router.put('/:id/tri',              requireAuth, requireRole(...ROLES_TRI), ReponsesController.decisionTri);

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
// PIÈCES JOINTES (courriel .msg/.eml, PDF, Excel)
// ─────────────────────────────────────────────────────────────
router.post('/:id/pieces-jointes',
  PiecesJointesController.uploadMiddleware,
  PiecesJointesController.upload);
router.get('/:id/pieces-jointes',              PiecesJointesController.list);
router.get('/pieces-jointes/:pieceId/telecharger', PiecesJointesController.download);
router.delete('/pieces-jointes/:pieceId',      PiecesJointesController.remove);

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
router.get('/public',               ReponsesController.getAllPublic);
router.get('/',                     ReponsesController.getAll);
router.get('/:id',                  ReponsesController.getById);
router.patch('/:id',                ReponsesController.patchReponses);
router.delete('/:id',               ReponsesController.supprimer);

module.exports = router;