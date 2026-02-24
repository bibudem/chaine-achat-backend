const express    = require('express');
const router     = express.Router();
const ReponsesController = require('../controllers/reponses');

router.post('/',          ReponsesController.create);
router.get('/decision',   ReponsesController.decision);  // ← appelé par n8n
router.get('/',           ReponsesController.getAll);
router.get('/:id',        ReponsesController.getById);

module.exports = router;