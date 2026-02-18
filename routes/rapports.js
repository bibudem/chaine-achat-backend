const express = require('express');
const router = express.Router();
const rapportsController = require('../controllers/rapports');

router.get('/statistiques', rapportsController.getStatistiquesGenerales);
router.get('/par-type', rapportsController.getRapportParType);
router.get('/detaille', rapportsController.getRapportDetaille);


module.exports = router;
