const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/utilisateurs');
const { requireAuth, requireRole } = require('../middleware/jwt.middleware');

// Gestion des profils utilisateurs — exclusive au SuperAdmin, même l'Admin n'y a pas accès
// (voir auth/callback.js pour la porte d'entrée Azure AD, et models/utilisateurs.js pour le
// rôle en base).
router.use(requireAuth, requireRole('SuperAdmin'));

router.get('/',       controller.list);
router.post('/',      controller.create);
router.put('/:id',    controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
