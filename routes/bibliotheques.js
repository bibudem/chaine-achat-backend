const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/bibliotheques');
const { requireAuth, requireSuperAdmin } = require('../middleware/jwt.middleware');

// Lecture : accessible à tout usager connecté (Admin/TDM/Usager) — les formulaires web
// (usager comme admin) en ont besoin pour peupler la liste déroulante Bibliothèque.
// Écriture : SuperAdmin seulement (Configuration > Bibliothèques) — l'Admin consulte en lecture seule.
router.get('/', requireAuth, controller.list);
router.post('/', requireSuperAdmin, controller.create);
router.put('/:id', requireSuperAdmin, controller.update);
router.delete('/:id', requireSuperAdmin, controller.remove);

module.exports = router;
