const express          = require('express');
const router           = express.Router();
const configController = require('../controllers/config');

router.get('/',     configController.getConfig);
router.put('/:cle', configController.updateConfig);

module.exports = router;
