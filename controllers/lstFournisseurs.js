const LstFournisseurs = require('../models/lstFournisseurs');

// GET /lst-fournisseurs
exports.getAll = async (req, res, next) => {
  try {
    // fetchAll retourne un objet { rows, rowCount, ... } provenant de pg
    const result = await LstFournisseurs.fetchAll();

    res.status(200).json({
      success: true,
      message: 'Liste des fournisseurs récupérée avec succès',
      data: result.rows,              // l'ensemble des lignes
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur getAll lstFournisseurs:', err);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};

// GET /lst-fournisseurs/:id
exports.getById = async (req, res, next) => {
  try {
    const result = await LstFournisseurs.fetchById(req.params.id);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Fournisseur introuvable',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fournisseur récupéré avec succès',
      data: result.rows[0],
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur getById lstFournisseurs:', err);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};

// POST /lst-fournisseurs
exports.create = async (req, res, next) => {
  try {
    const { titre, format_offert, affichage_prix, type_document, description, modifie_par } = req.body;

    if (!titre) {
      return res.status(400).json({
        success: false,
        error: 'Le titre est obligatoire',
        timestamp: new Date().toISOString()
      });
    }

    const result = await LstFournisseurs.create(
      titre, format_offert, affichage_prix, type_document, description, modifie_par
    );

    res.status(201).json({
      success: true,
      message: 'Fournisseur créé avec succès',
      data: { id_fournisseur: result.rows[0].id_fournisseur },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur create lstFournisseurs:', err);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};

// PUT /lst-fournisseurs/:id
exports.update = async (req, res, next) => {
  try {
    const { titre, format_offert, affichage_prix, type_document, description, modifie_par } = req.body;
    const { id } = req.params;

    const result = await LstFournisseurs.update(
      id, titre, format_offert, affichage_prix, type_document, description, modifie_par
    );

    // pg renvoie un rowCount indiquant le nombre de lignes modifiées
    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: 'Fournisseur introuvable',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fournisseur mis à jour avec succès',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur update lstFournisseurs:', err);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};

// DELETE /lst-fournisseurs/:id
exports.remove = async (req, res, next) => {
  try {
    const { modifie_par } = req.body;

    const result = await LstFournisseurs.remove(req.params.id, modifie_par);

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: 'Fournisseur introuvable',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fournisseur supprimé avec succès',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur remove lstFournisseurs:', err);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};