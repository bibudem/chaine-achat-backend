const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/courriels');
const { requireAdmin } = require('../middleware/jwt.middleware');

// Retour de n8n après chaque envoi : secret partagé (en-tête X-Courriel-Secret), pas de session.
router.post('/retour', controller.retour);

// Envoi du courriel de suivi (page de décision ACQ), Registres → Courriels envoyés et
// historique d'une demande : Admin et SuperAdmin seulement.
router.post('/decision', requireAdmin, controller.envoyerDecision);
router.get('/',         requireAdmin, controller.lister);
router.get('/item/:id', requireAdmin, controller.parItem);

module.exports = router;
