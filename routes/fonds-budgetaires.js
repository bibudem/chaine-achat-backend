const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/fonds-budgetaires');
const { requireAuth, requireSuperAdmin } = require('../middleware/jwt.middleware');

// Lecture : accessible à tout usager connecté (Admin/TDM/Usager) — les formulaires web
// (usager comme admin) en ont besoin pour peupler la liste déroulante Fonds budgétaire.
// Écriture : SuperAdmin seulement (Configuration > Fonds budgétaires) — l'Admin consulte en lecture seule.
router.get('/', requireAuth, controller.list);
router.post('/', requireSuperAdmin, controller.create);
router.put('/:id', requireSuperAdmin, controller.update);
router.delete('/:id', requireSuperAdmin, controller.remove);

module.exports = router;
