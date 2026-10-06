const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/bibliotheques');
const { requireAuth, requireRole } = require('../middleware/jwt.middleware');

// Lecture : accessible à tout usager connecté (Admin/TDM/Usager) — les formulaires web
// (usager comme admin) en ont besoin pour peupler la liste déroulante Bibliothèque.
// Écriture : réservée aux Admin (le SuperAdmin hérite de tous les accès Admin), voir
// Configuration > Bibliothèques.
router.get('/', requireAuth, controller.list);
router.post('/', requireAuth, requireRole('Admin', 'SuperAdmin'), controller.create);
router.put('/:id', requireAuth, requireRole('Admin', 'SuperAdmin'), controller.update);
router.delete('/:id', requireAuth, requireRole('Admin', 'SuperAdmin'), controller.remove);

module.exports = router;
