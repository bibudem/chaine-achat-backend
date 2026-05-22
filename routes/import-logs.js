const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/import-logs');

// GET  /import-logs          — liste paginée (query: page, limit, type, statut)
router.get('/',     controller.getAll);

// GET  /import-logs/:id      — détail d'un log avec erreurs complètes
router.get('/:id',  controller.getById);

module.exports = router;
