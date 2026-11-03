const express          = require('express');
const router           = express.Router();
const configController = require('../controllers/config');
const { requirePersonnel, requireAdmin } = require('../middleware/jwt.middleware');

router.get('/',     requirePersonnel, configController.getConfig);
router.put('/:cle', requireAdmin,     configController.updateConfig);

module.exports = router;
