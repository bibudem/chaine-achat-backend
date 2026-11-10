const express               = require('express');
const router                = express.Router();
const tauxDevisesController = require('../controllers/taux-devises');
const { requirePersonnel, requireSuperAdmin } = require('../middleware/jwt.middleware');

// Lecture : tout le personnel (conversion des prix). Écriture : SuperAdmin seulement
// (Configuration > Taux de change) — l'Admin consulte en lecture seule.

router.get('/',                       requirePersonnel, tauxDevisesController.getAll);
router.get('/actuelle',               requirePersonnel, tauxDevisesController.getActuelle);
router.post('/',                      requireSuperAdmin, tauxDevisesController.creerPeriode);
router.put('/:id',                    requireSuperAdmin, tauxDevisesController.modifierPeriode);
router.put('/:id/devises/:devise',    requireSuperAdmin, tauxDevisesController.upsertTauxDevise);
router.delete('/:id/devises/:devise', requireSuperAdmin, tauxDevisesController.supprimerTauxDevise);
router.delete('/:id',                 requireSuperAdmin, tauxDevisesController.supprimerPeriode);

module.exports = router;
