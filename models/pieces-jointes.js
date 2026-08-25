/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base : voir sql/pieces_jointes.sql
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

const PiecesJointesModel = {

  // reponse_id et item_id sont tous les deux optionnels, mais l'un des deux doit être fourni
  // (réponse usager en cours, upload direct sur un item déjà créé côté admin, ou les deux
  // une fois que lierItem() a fait le lien après approbation ACQ).
  async create({ reponse_id = null, item_id = null, nom_fichier, type_mime, taille_octets, contenu }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_pieces_jointes
         (reponse_id, item_id, nom_fichier, type_mime, taille_octets, contenu)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING piece_id, reponse_id, item_id, nom_fichier, type_mime, taille_octets, date_ajout`,
      [reponse_id, item_id, nom_fichier, type_mime, taille_octets, contenu]
    );
    return rows[0];
  },

  // Métadonnées seulement (sans le contenu binaire) — pour l'affichage en liste
  async findByReponseId(reponse_id) {
    const { rows } = await pool.query(
      `SELECT piece_id, reponse_id, item_id, nom_fichier, type_mime, taille_octets, date_ajout
         FROM tbl_pieces_jointes
        WHERE reponse_id = $1
        ORDER BY date_ajout`,
      [reponse_id]
    );
    return rows;
  },

  // Métadonnées seulement — pièces jointes rattachées à un item déjà créé
  // (celles de la réponse d'origine une fois liées par lierItem(), + celles ajoutées
  // directement par un admin sur la fiche item).
  async findByItemId(item_id) {
    const { rows } = await pool.query(
      `SELECT piece_id, reponse_id, item_id, nom_fichier, type_mime, taille_octets, date_ajout
         FROM tbl_pieces_jointes
        WHERE item_id = $1
        ORDER BY date_ajout`,
      [item_id]
    );
    return rows;
  },

  // Avec le contenu binaire — pour le téléchargement
  async findById(piece_id) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_pieces_jointes WHERE piece_id = $1`,
      [piece_id]
    );
    return rows[0] || null;
  },

  async deleteById(piece_id) {
    const { rowCount } = await pool.query(
      `DELETE FROM tbl_pieces_jointes WHERE piece_id = $1`,
      [piece_id]
    );
    return rowCount > 0;
  },

  // Relie les pièces jointes d'une réponse à l'item créé lors de l'approbation ACQ.
  // Doit être appelé avec le même client que la transaction de création de l'item
  // (voir models/reponses.js — insererApresApprobation & consœurs).
  async lierItem(client, reponse_id, item_id) {
    await client.query(
      `UPDATE tbl_pieces_jointes SET item_id = $1 WHERE reponse_id = $2`,
      [item_id, reponse_id]
    );
  }
};

module.exports = PiecesJointesModel;
