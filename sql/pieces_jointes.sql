-- ═══════════════════════════════════════════════════════════════════════
-- Pièces jointes des formulaires (courriel .msg/.eml, PDF, Excel)
--
-- Une pièce jointe est rattachée à une réponse usager (reponse_id) et/ou
-- à un item déjà créé (item_id) : les deux sont nullables car un admin
-- peut aussi ajouter une pièce jointe directement sur la fiche item
-- (item importé par Excel ou créé sans réponse usager d'origine).
-- Quand l'item est créé depuis une réponse (approbation ACQ), item_id est
-- rempli automatiquement sur les pièces existantes (voir lierItem() dans
-- models/pieces-jointes.js).
--
-- À exécuter une seule fois sur la base PostgreSQL.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tbl_pieces_jointes (
  piece_id      SERIAL PRIMARY KEY,
  reponse_id    INTEGER      REFERENCES tbl_reponses(id) ON DELETE CASCADE,
  item_id       INTEGER      REFERENCES tbl_items(item_id) ON DELETE SET NULL,
  nom_fichier   VARCHAR(255) NOT NULL,
  type_mime     VARCHAR(150) NOT NULL,
  taille_octets INTEGER      NOT NULL,
  contenu       BYTEA        NOT NULL,
  date_ajout    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pieces_jointes_reponse ON tbl_pieces_jointes (reponse_id);
CREATE INDEX IF NOT EXISTS idx_pieces_jointes_item    ON tbl_pieces_jointes (item_id);

-- Migration : si la table a déjà été créée avec la première version du script
-- (reponse_id NOT NULL), la rendre nullable pour permettre l'ajout direct sur
-- un item côté admin. Sans effet si déjà nullable (nouvelle installation).
ALTER TABLE tbl_pieces_jointes ALTER COLUMN reponse_id DROP NOT NULL;
