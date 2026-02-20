const express = require('express');
const router = express.Router();
const ReponsesController = require('../controllers/reponses');

router.post('/',        ReponsesController.create);
router.get('/',         ReponsesController.getAll);
router.get('/:id',      ReponsesController.getById);

module.exports = router;