const express          = require('express');
const router           = express.Router();
const configController = require('../controllers/config');
const { requirePersonnel, requireGestion } = require('../middleware/jwt.middleware');

router.get('/',     requirePersonnel, configController.getConfig);
router.put('/:cle', requireGestion,   configController.updateConfig);

module.exports = router;
