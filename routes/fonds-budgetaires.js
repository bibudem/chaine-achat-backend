const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/fonds-budgetaires');
const { requireAuth, requireRole } = require('../middleware/jwt.middleware');

// Lecture : accessible à tout usager connecté (Admin/TDM/Usager) — les formulaires web
// (usager comme admin) en ont besoin pour peupler la liste déroulante Fonds budgétaire.
// Écriture : réservée aux Admin, voir Configuration > Fonds budgétaires.
router.get('/', requireAuth, controller.list);
router.post('/', requireAuth, requireRole('Admin'), controller.create);
router.put('/:id', requireAuth, requireRole('Admin'), controller.update);
router.delete('/:id', requireAuth, requireRole('Admin'), controller.remove);

module.exports = router;
