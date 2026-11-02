const express = require('express');
const router = express.Router();
const rapportsController = require('../controllers/rapports');
const { requireAuth, requireRole } = require('../middleware/jwt.middleware');

router.get('/statistiques', rapportsController.getStatistiquesGenerales);
router.get('/detaille',     rapportsController.getRapportDetaille);
// Personnel seulement (pas la communauté UdeM) — mêmes rôles que StaffGuard côté Angular.
router.get('/suivis-bibliotheques', requireAuth,
  requireRole('Admin', 'SuperAdmin', 'TDM', 'Employe', 'TechDoc'),
  rapportsController.getSuivisBibliotheques);

module.exports = router;