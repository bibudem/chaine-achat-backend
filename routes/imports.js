const express = require('express');
const router  = express.Router();
const multer  = require('multer');

console.log('🛣️ Initialisation des routes import...');

// ==================== CHARGEMENT DU CONTRÔLEUR ====================
let importController;
try {
  importController = require('../controllers/import');
  console.log('✅ Contrôleur import chargé');
} catch (error) {
  console.error('❌ Erreur chargement contrôleur import:', error.message);
  importController = {
    importExcel:       (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
    downloadTemplate:  (req, res) => res.status(500).json({ error: 'Contrôleur non disponible' }),
  };
}

// Vérifier que le contrôleur a les méthodes nécessaires
const requiredMethods = ['importExcel', 'downloadTemplate'];
requiredMethods.forEach(method => {
  if (typeof importController[method] !== 'function') {
    console.error(`❌ Méthode manquante: ${method}`);
    importController[method] = (req, res) =>
      res.status(500).json({ error: `Méthode ${method} non implémentée` });
  }
});

// ==================== MULTER — stockage mémoire ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream' // certains navigateurs envoient ce type pour .xlsx
    ];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers Excel (.xlsx, .xls) sont acceptés'));
    }
  }
});

// ==================== ROUTES IMPORT ====================

// POST — importer un fichier Excel pour un type de formulaire
// ex: POST /import/Nouvel achat unique   (type encodé dans l'URL)
router.post('/:type', upload.single('file'), importController.importExcel);

// GET  — télécharger le modèle Excel vide pour un type
// ex: GET /import/template/Nouvel achat unique
router.get('/template/:type', importController.downloadTemplate);

// ==================== ROUTE DE TEST ====================
router.get('/test', (req, res) => {
  res.json({
    message:   'Routes import fonctionnelles',
    database:  'PostgreSQL',
    timestamp: new Date().toISOString(),
    routes: {
      import:   'POST /import/:type  (multipart/form-data, champ "file")',
      template: 'GET  /import/template/:type',
      types: [
        'Modification et CCOL',
        'Nouvel abonnement',
        'Nouvel achat unique',
        'PEB Tipasa numérique',
        'Requête ACQ',
        'Springer',
        "Suggestion d'achat"
      ]
    }
  });
});

console.log('✅ Routes import configurées avec succès');
module.exports = router;