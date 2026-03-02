// Le projet utilise PostgreSQL via le module `pg`.
// Contrairement à mysql2 qui propose `pool.execute`, l'objet `Pool`
// de `pg` expose la méthode `query`.  C'est la raison pour laquelle
// on voyait l'erreur «pool.execute is not a function» lorsque la
// route était appelée.  Nous convertissons donc toutes les méthodes
// pour utiliser `query` et, lorsque pertinent, tirer profit de
// `RETURNING` pour récupérer l'identifiant créé.

const pool = require('../config/postgres.config');

// GET - Tous les fournisseurs actifs
exports.fetchAll = async () => {
  // renvoie l'objet retourné par pg (rows, rowCount, etc.)
  // la colonne `actif` est de type boolean dans la base ;
  // la comparaison à l'entier 1 provoquait l'erreur
  // «l'opérateur n'existe pas : boolean = integer».
  // On utilise donc `true` (ou simplement `actif`) pour filtrer.
  return pool.query(
    `SELECT * FROM lst_fournisseurs WHERE actif = TRUE ORDER BY titre ASC`
  );
};

// GET - Un fournisseur par ID
exports.fetchById = async (id) => {
  return pool.query(
    `SELECT * FROM lst_fournisseurs WHERE id_fournisseur = $1`,
    [id]
  );
};

// POST - Créer un fournisseur
exports.create = async (titre, format_offert, affichage_prix, type_document, description, modifie_par) => {
  return pool.query(
    `INSERT INTO lst_fournisseurs 
       (titre, format_offert, affichage_prix, type_document, description, modifie_par)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_fournisseur`,
    [titre, format_offert, affichage_prix, type_document, description, modifie_par]
  );
};

// PUT - Modifier un fournisseur
exports.update = async (id, titre, format_offert, affichage_prix, type_document, description, modifie_par) => {
  return pool.query(
    `UPDATE lst_fournisseurs
     SET titre          = $1,
         format_offert  = $2,
         affichage_prix = $3,
         type_document  = $4,
         description    = $5,
         modifie_par    = $6
     WHERE id_fournisseur = $7`,
    [titre, format_offert, affichage_prix, type_document, description, modifie_par, id]
  );
};

// DELETE - Soft delete (désactiver)
exports.remove = async (id, modifie_par) => {
  return pool.query(
    `UPDATE lst_fournisseurs 
     SET actif = FALSE, modifie_par = $1
     WHERE id_fournisseur = $2`,
    [modifie_par, id]
  );
};