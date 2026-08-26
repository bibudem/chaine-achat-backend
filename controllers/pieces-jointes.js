const multer             = require('multer');
const PiecesJointesModel  = require('../models/pieces-jointes');
const ReponsesModel       = require('../models/reponses');

// Note : la Lambda est exposée derrière API Gateway (limite de payload ~10 Mo) —
// on borne donc chaque fichier à 10 Mo et à 3 fichiers max par réponse.
const MAX_SIZE  = 10 * 1024 * 1024; // 10 Mo
const MAX_FILES = 3;

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   // .xlsx
  'application/vnd.ms-excel',                                            // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',                                                  // .doc
  'application/vnd.ms-outlook',                                          // .msg
  'message/rfc822',                                                      // .eml
  'application/octet-stream', // certains navigateurs envoient ce type pour .msg/.eml/.xlsx/.docx
];
const ALLOWED_EXT = ['.pdf', '.xlsx', '.xls', '.doc', '.docx', '.msg', '.eml'];

// multer/busboy décode le nom de fichier envoyé par le navigateur en latin1 par défaut,
// alors que les navigateurs l'encodent en UTF-8 (RFC 5987/6266) — sans ce correctif, un
// nom accentué ("accès.pdf") arrive corrompu ("accÃ¨s.pdf"). On ré-encode les octets bruts
// (latin1) en UTF-8 pour retrouver le nom d'origine.
function decoderNomFichier(nom) {
  return Buffer.from(nom, 'latin1').toString('utf8');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ext  = name.slice(name.lastIndexOf('.'));
    if (ALLOWED_MIME.includes(file.mimetype) || ALLOWED_EXT.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF, Word (.doc, .docx), Excel (.xlsx, .xls) ou courriel (.msg, .eml) sont acceptés.'));
    }
  }
});

const PiecesJointesController = {

  uploadMiddleware: upload.array('fichiers', MAX_FILES),

  // POST /reponses/:id/pieces-jointes  (multipart/form-data, champ "fichiers")
  async upload(req, res) {
    const reponseId = parseInt(req.params.id, 10);
    if (!reponseId) return res.status(400).json({ error: 'id invalide.' });

    if (!req.files?.length) {
      return res.status(400).json({ error: 'Aucun fichier reçu (champ "fichiers").' });
    }

    try {
      const reponse = await ReponsesModel.findById(reponseId);
      if (!reponse) return res.status(404).json({ error: 'Réponse introuvable.' });

      // Si l'item a déjà été matérialisé avant cet upload (ex. demande soumise
      // directement en "Soumettre aux ACQ" — voir _materialiserItem côté contrôleur
      // reponses), lierItem() est déjà passé et ne repassera plus derrière ces
      // fichiers. On renseigne donc item_id dès l'insertion pour ne pas les laisser
      // orphelins (invisibles quand on consulte l'item par la suite).
      const inserted = [];
      for (const file of req.files) {
        const piece = await PiecesJointesModel.create({
          reponse_id:    reponseId,
          item_id:       reponse.item_id_cree || null,
          nom_fichier:   decoderNomFichier(file.originalname),
          type_mime:     file.mimetype,
          taille_octets: file.size,
          contenu:       file.buffer
        });
        inserted.push(piece);
      }

      res.status(201).json({ success: true, piecesJointes: inserted });
    } catch (err) {
      console.error('[pieces-jointes] upload:', err);
      res.status(500).json({ error: "Erreur lors de l'enregistrement de la pièce jointe." });
    }
  },

  // GET /reponses/:id/pieces-jointes — métadonnées seulement
  async list(req, res) {
    const reponseId = parseInt(req.params.id, 10);
    if (!reponseId) return res.status(400).json({ error: 'id invalide.' });
    try {
      const pieces = await PiecesJointesModel.findByReponseId(reponseId);
      res.json({ data: pieces });
    } catch (err) {
      console.error('[pieces-jointes] list:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des pièces jointes.' });
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CÔTÉ ADMIN — pièces jointes ajoutées/consultées directement sur un item
  // (fiche item déjà créée, avec ou sans réponse usager d'origine)
  // ═══════════════════════════════════════════════════════════

  // POST /items/:id/pieces-jointes  (multipart/form-data, champ "fichiers")
  async uploadForItem(req, res) {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) return res.status(400).json({ error: 'id invalide.' });

    if (!req.files?.length) {
      return res.status(400).json({ error: 'Aucun fichier reçu (champ "fichiers").' });
    }

    try {
      const inserted = [];
      for (const file of req.files) {
        const piece = await PiecesJointesModel.create({
          item_id:       itemId,
          nom_fichier:   decoderNomFichier(file.originalname),
          type_mime:     file.mimetype,
          taille_octets: file.size,
          contenu:       file.buffer
        });
        inserted.push(piece);
      }
      res.status(201).json({ success: true, piecesJointes: inserted });
    } catch (err) {
      console.error('[pieces-jointes] uploadForItem:', err);
      res.status(500).json({ error: "Erreur lors de l'enregistrement de la pièce jointe." });
    }
  },

  // GET /items/:id/pieces-jointes — métadonnées seulement
  async listByItem(req, res) {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) return res.status(400).json({ error: 'id invalide.' });
    try {
      const pieces = await PiecesJointesModel.findByItemId(itemId);
      res.json({ data: pieces });
    } catch (err) {
      console.error('[pieces-jointes] listByItem:', err);
      res.status(500).json({ error: 'Erreur lors de la récupération des pièces jointes.' });
    }
  },

  // GET /reponses/pieces-jointes/:pieceId/telecharger
  async download(req, res) {
    const pieceId = parseInt(req.params.pieceId, 10);
    if (!pieceId) return res.status(400).json({ error: 'id invalide.' });
    try {
      const piece = await PiecesJointesModel.findById(pieceId);
      if (!piece) return res.status(404).json({ error: 'Pièce jointe introuvable.' });

      res.setHeader('Content-Type', piece.type_mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(piece.nom_fichier)}"`);
      res.send(piece.contenu);
    } catch (err) {
      console.error('[pieces-jointes] download:', err);
      res.status(500).json({ error: 'Erreur lors du téléchargement.' });
    }
  },

  // DELETE /reponses/pieces-jointes/:pieceId
  async remove(req, res) {
    const pieceId = parseInt(req.params.pieceId, 10);
    if (!pieceId) return res.status(400).json({ error: 'id invalide.' });
    try {
      const deleted = await PiecesJointesModel.deleteById(pieceId);
      if (!deleted) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
      res.status(204).send();
    } catch (err) {
      console.error('[pieces-jointes] remove:', err);
      res.status(500).json({ error: 'Erreur lors de la suppression.' });
    }
  }
};

module.exports = PiecesJointesController;
