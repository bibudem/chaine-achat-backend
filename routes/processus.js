const express = require('express');

const processusController = require('../controllers/processus');

const router = express.Router();

router.get('/all', processusController.getAllProcessus);

router.get('/liste-details/:id', processusController.getAllDetailsProcessus);

router.get('/last-processus', processusController.getLastIdProcessus);

router.post('/lot-monographies', processusController.postLotMonographies);

router.post('/lot-films', processusController.postLotFilms);

router.post('/lot-prets', processusController.postLotPrets);

router.put('/add', processusController.ajoutProcessus);

router.delete('/delete/:id', processusController.deleteProcessus);


module.exports = router;
