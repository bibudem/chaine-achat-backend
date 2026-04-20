const express = require('express');
const router  = express.Router();
const homeController = require('../controllers/home');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTES HOME / DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// GET /home/all          → dashboard + graphiques (appel unique depuis Angular)
router.get('/all',       homeController.getAllData);

// GET /home/dashboard    → statistiques du tableau de bord seulement
router.get('/dashboard', homeController.getCount);

// GET /home/graph        → données graphiques seulement
router.get('/graph',     homeController.getGraphiqueDonnees);

// GET /home/type-counts  → comptage toutes périodes par formulaire_type
router.get('/type-counts', homeController.getTypeCounts);

module.exports = router;