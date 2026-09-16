const express               = require('express');
const router                = express.Router();
const tauxDevisesController = require('../controllers/taux-devises');

router.get('/',                       tauxDevisesController.getAll);
router.post('/',                      tauxDevisesController.creerPeriode);
router.put('/:id',                    tauxDevisesController.modifierPeriode);
router.put('/:id/devises/:devise',    tauxDevisesController.upsertTauxDevise);
router.delete('/:id/devises/:devise', tauxDevisesController.supprimerTauxDevise);
router.delete('/:id',                 tauxDevisesController.supprimerPeriode);

module.exports = router;
