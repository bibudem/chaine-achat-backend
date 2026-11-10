const express             = require('express');
const router              = express.Router();
const ReponsesController  = require('../controllers/reponses');
const PiecesJointesController = require('../controllers/pieces-jointes');
const { requireAuth, requireRole, requirePersonnel, requireAdmin } = require('../middleware/jwt.middleware');

// Équipe de tri des suggestions publiques — Admin/SuperAdmin aussi, pour la supervision.
const ROLES_TRI = ['TechDocTri', 'Admin', 'SuperAdmin'];

// ─────────────────────────────────────────────────────────────
// SUGGESTION D'ACHAT
// ─────────────────────────────────────────────────────────────
router.post('/suggestion', requirePersonnel,          ReponsesController.createSuggestion);

// ─────────────────────────────────────────────────────────────
// SUGGESTION PUBLIQUE (communauté UdeM) + TRI PAR L'ÉQUIPE TECHDOC
// Déclarées avant les routes génériques /:id plus bas.
// ─────────────────────────────────────────────────────────────
router.post('/suggestion-publique', requireAuth, ReponsesController.createSuggestionPublique);
router.get('/tri',                  requireAuth, requireRole(...ROLES_TRI), ReponsesController.listTri);
router.put('/:id/tri',              requireAuth, requireRole(...ROLES_TRI), ReponsesController.decisionTri);
// « Transmise en bibliothèque » (page de décision) tant que la suggestion n'est pas un item.
router.put('/:id/techdoc-transmise', requireAuth, requireRole(...ROLES_TRI), ReponsesController.majTechdocTransmise);

// ─────────────────────────────────────────────────────────────
// NOUVEL ACHAT UNIQUE
// ─────────────────────────────────────────────────────────────
router.post('/nouvel-achat', requirePersonnel,        ReponsesController.createNouvelAchat);

// ─────────────────────────────────────────────────────────────
// NOUVEL ABONNEMENT
// ─────────────────────────────────────────────────────────────
router.post('/nouvel-abonnement', requirePersonnel,   ReponsesController.createNouvelAbonnement);

// ─────────────────────────────────────────────────────────────
// MODIFICATION CCOL
// ─────────────────────────────────────────────────────────────
router.post('/modification-ccol', requirePersonnel,   ReponsesController.createModificationCcol);

// ─────────────────────────────────────────────────────────────
// PEB TIPASA NUMÉRIQUE
// ─────────────────────────────────────────────────────────────
router.post('/peb-tipasa', requirePersonnel,          ReponsesController.createPebTipasa);

// ─────────────────────────────────────────────────────────────
// REQUÊTE ACQ
// ─────────────────────────────────────────────────────────────
router.post('/requete-accessibilite', requirePersonnel, ReponsesController.createRequeteAcq);

// ─────────────────────────────────────────────────────────────
// CRÉER L'ITEM DEPUIS UNE RÉPONSE (idempotent)
// POST /reponses/:id/creer-item
// ─────────────────────────────────────────────────────────────
router.post('/:id/creer-item', requirePersonnel,      ReponsesController.creerItem);

// ─────────────────────────────────────────────────────────────
// PIÈCES JOINTES (courriel .msg/.eml, PDF, Excel)
// ─────────────────────────────────────────────────────────────
router.post('/:id/pieces-jointes', requirePersonnel,
  PiecesJointesController.uploadMiddleware,
  PiecesJointesController.upload);
router.get('/:id/pieces-jointes', requirePersonnel,              PiecesJointesController.list);
router.get('/pieces-jointes/:pieceId/telecharger', requirePersonnel, PiecesJointesController.download);
router.delete('/pieces-jointes/:pieceId', requirePersonnel,      PiecesJointesController.remove);

// ─────────────────────────────────────────────────────────────
// LECTURE (commun)
// ─────────────────────────────────────────────────────────────
router.get('/pending', requirePersonnel,              ReponsesController.getPending);
router.get('/profil', requirePersonnel,               ReponsesController.getByEmail);
router.get('/public', requirePersonnel,               ReponsesController.getAllPublic);
router.get('/', requirePersonnel,                     ReponsesController.getAll);
router.get('/:id', requirePersonnel,                  ReponsesController.getById);
router.patch('/:id',                requireAuth, ReponsesController.patchReponses);
router.delete('/:id', requirePersonnel,               ReponsesController.supprimer);

module.exports = router;