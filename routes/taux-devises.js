const express               = require('express');
const router                = express.Router();
const tauxDevisesController = require('../controllers/taux-devises');
const { requirePersonnel, requireAdmin } = require('../middleware/jwt.middleware');

router.get('/',                       requirePersonnel, tauxDevisesController.getAll);
router.get('/actuelle',               requirePersonnel, tauxDevisesController.getActuelle);
router.post('/',                      requireAdmin,     tauxDevisesController.creerPeriode);
router.put('/:id',                    requireAdmin,     tauxDevisesController.modifierPeriode);
router.put('/:id/devises/:devise',    requireAdmin,     tauxDevisesController.upsertTauxDevise);
router.delete('/:id/devises/:devise', requireAdmin,     tauxDevisesController.supprimerTauxDevise);
router.delete('/:id',                 requireAdmin,     tauxDevisesController.supprimerPeriode);

module.exports = router;
