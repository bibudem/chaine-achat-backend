const express = require('express');
const router = express.Router();

console.log('🛣️ Initialisation des routes items...');

// Import du contrôleur avec gestion d'erreur
let itemsController;
try {
  itemsController = require('../controllers/items');
  console.log('✅ Contrôleur items chargé');
} catch (error) {
  console.error('❌ Erreur chargement contrôleur:', error.message);
  // Créer un contrôleur de secours
  itemsController = {
    postItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    putItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    deleteItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    consulterItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    getAllItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    searchItems: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    getItemsByType: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    getItemsByStatus: (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' })
  };
}

// Vérifier que le contrôleur a les méthodes nécessaires
const requiredMethods = [
  'postItems', 
  'putItems', 
  'deleteItems', 
  'consulterItems',
  'getAllItems',
  'searchItems',
  'getItemsByType',
  'getItemsByStatus'
];

requiredMethods.forEach(method => {
  if (typeof itemsController[method] !== 'function') {
    console.error(`❌ Méthode manquante: ${method}`);
    itemsController[method] = (req, res) => 
      res.status(500).json({ error: `Méthode ${method} non implémentée` });
  }
});

// ==================== ROUTES CRUD ====================

// CREATE - Ajouter un nouvel item
router.post('/add', itemsController.postItems);

// READ - Consulter un item par ID
router.get('/fiche/:id', itemsController.consulterItems);

// UPDATE - Modifier un item
router.put('/save/:id', itemsController.putItems);

// DELETE - Supprimer un item
router.delete('/delete/:id', itemsController.deleteItems);

// ==================== ROUTES DE LISTING ====================

// GET ALL - Récupérer tous les items avec pagination
router.get('/all', itemsController.getAllItems);

// SEARCH - Rechercher des items
router.get('/search', itemsController.searchItems);

// FILTER BY TYPE - Filtrer par type de formulaire
router.get('/type/:type', itemsController.getItemsByType);

// FILTER BY STATUS - Filtrer par statut
router.get('/status/:status', itemsController.getItemsByStatus);

// ==================== ROUTE DE TEST ====================

// Route de test pour vérifier que les routes fonctionnent
router.get('/test', (req, res) => {
  res.json({
    message: 'Routes items fonctionnelles',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString(),
    routes: {
      create: 'POST /items/add',
      read: 'GET /items/fiche/:id',
      update: 'PUT /items/save/:id',
      delete: 'DELETE /items/delete/:id',
      list: 'GET /items/all',
      search: 'GET /items/search?q=terme',
      byType: 'GET /items/type/:type',
      byStatus: 'GET /items/status/:status'
    }
  });
});

console.log('Routes items configurées avec succès');

module.exports = router;