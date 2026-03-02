const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/lstFournisseurs');

router.get('/all',         ctrl.getAll);
router.get('/:id',      ctrl.getById);
router.post('/',        ctrl.create);
router.put('/:id',      ctrl.update);
router.delete('/:id',   ctrl.remove);

module.exports = router;