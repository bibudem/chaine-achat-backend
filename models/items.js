// ============================================================
// BACKEND — Champs suggestion d'achat (Node.js / Express + pg)
// ============================================================

// ──────────────────────────────────────────────────────────────
// HELPER : extraction des champs spécifiques à suggestion_achat
// ──────────────────────────────────────────────────────────────
function extractSuggestionAchatData(specificData = {}) {
  return {
    auteur:                       specificData.auteur                       ?? null,
    usager_nom:                   specificData.usager_nom                   ?? null,
    usager_statut:                specificData.usager_statut                ?? null,
    usager_faculte:               specificData.usager_faculte               ?? null,
    usager_courriel:              specificData.usager_courriel              ?? null,
    bibliothecaire_disciplinaire: specificData.bibliothecaire_disciplinaire ?? null,
    aviser_reservation:           specificData.aviser_reservation           ?? null,
    aviser_reception:             specificData.aviser_reception             ?? true,
    date_requise_cours:           specificData.date_requise_cours           || null,
    note_usager:                  specificData.note_usager                  ?? null,
    techdoc_suggestion_transmise: specificData.techdoc_suggestion_transmise ?? false,
    acq_raison_annulation:        specificData.acq_raison_annulation        ?? null,
    acq_isbn:                     specificData.acq_isbn                     ?? null,
    reserve_cours:                specificData.reserve_cours                ?? false,
    reserve_cours_sigle:          specificData.reserve_cours_sigle          ?? null,
    bordereau_imprime:            specificData.bordereau_imprime            ?? 'Non',
    acq_responsable_courriel:     specificData.acq_responsable_courriel     ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
// INSERT  —  appelé dans votre route POST /items/add
// ──────────────────────────────────────────────────────────────
async function insertSuggestionAchat(client, itemId, specificData) {
  const d = extractSuggestionAchatData(specificData);

  const query = `
    INSERT INTO tbl_suggestion_achat (
      item_id,
      auteur,
      usager_nom,
      usager_statut,
      usager_faculte,
      usager_courriel,
      bibliothecaire_disciplinaire,
      aviser_reservation,
      aviser_reception,
      date_requise_cours,
      note_usager,
      techdoc_suggestion_transmise,
      acq_raison_annulation,
      acq_isbn,
      reserve_cours,
      reserve_cours_sigle,
      bordereau_imprime,
      acq_responsable_courriel
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    ON CONFLICT (item_id) DO UPDATE SET
      auteur                       = EXCLUDED.auteur,
      usager_nom                   = EXCLUDED.usager_nom,
      usager_statut                = EXCLUDED.usager_statut,
      usager_faculte               = EXCLUDED.usager_faculte,
      usager_courriel              = EXCLUDED.usager_courriel,
      bibliothecaire_disciplinaire = EXCLUDED.bibliothecaire_disciplinaire,
      aviser_reservation           = EXCLUDED.aviser_reservation,
      aviser_reception             = EXCLUDED.aviser_reception,
      date_requise_cours           = EXCLUDED.date_requise_cours,
      note_usager                  = EXCLUDED.note_usager,
      techdoc_suggestion_transmise = EXCLUDED.techdoc_suggestion_transmise,
      acq_raison_annulation        = EXCLUDED.acq_raison_annulation,
      acq_isbn                     = EXCLUDED.acq_isbn,
      reserve_cours                = EXCLUDED.reserve_cours,
      reserve_cours_sigle          = EXCLUDED.reserve_cours_sigle,
      bordereau_imprime            = EXCLUDED.bordereau_imprime,
      acq_responsable_courriel     = EXCLUDED.acq_responsable_courriel
    RETURNING *;
  `;

  const values = [
    itemId,
    d.auteur,
    d.usager_nom,
    d.usager_statut,
    d.usager_faculte,
    d.usager_courriel,
    d.bibliothecaire_disciplinaire,
    d.aviser_reservation,
    d.aviser_reception,
    d.date_requise_cours,
    d.note_usager,
    d.techdoc_suggestion_transmise,
    d.acq_raison_annulation,
    d.acq_isbn,
    d.reserve_cours,
    d.reserve_cours_sigle,
    d.bordereau_imprime,
    d.acq_responsable_courriel,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

// ──────────────────────────────────────────────────────────────
// UPDATE  —  appelé dans votre route PUT /items/save/:id
// ──────────────────────────────────────────────────────────────
async function updateSuggestionAchat(client, itemId, specificData) {
  const d = extractSuggestionAchatData(specificData);

  const query = `
    UPDATE tbl_suggestion_achat SET
      auteur                       = $2,
      usager_nom                   = $3,
      usager_statut                = $4,
      usager_faculte               = $5,
      usager_courriel              = $6,
      bibliothecaire_disciplinaire = $7,
      aviser_reservation           = $8,
      aviser_reception             = $9,
      date_requise_cours           = $10,
      note_usager                  = $11,
      techdoc_suggestion_transmise = $12,
      acq_raison_annulation        = $13,
      acq_isbn                     = $14,
      reserve_cours                = $15,
      reserve_cours_sigle          = $16,
      bordereau_imprime            = $17,
      acq_responsable_courriel     = $18
    WHERE item_id = $1
    RETURNING *;
  `;

  const values = [
    itemId,
    d.auteur,
    d.usager_nom,
    d.usager_statut,
    d.usager_faculte,
    d.usager_courriel,
    d.bibliothecaire_disciplinaire,
    d.aviser_reservation,
    d.aviser_reception,
    d.date_requise_cours,
    d.note_usager,
    d.techdoc_suggestion_transmise,
    d.acq_raison_annulation,
    d.acq_isbn,
    d.reserve_cours,
    d.reserve_cours_sigle,
    d.bordereau_imprime,
    d.acq_responsable_courriel,
  ];

  const result = await client.query(query, values);

  if (result.rowCount === 0) {
    return insertSuggestionAchat(client, itemId, specificData);
  }

  return result.rows[0];
}

// ──────────────────────────────────────────────────────────────
// Colonnes SELECT pour GET /items/fiche/:id
// ──────────────────────────────────────────────────────────────
const GET_FICHE_SUGGESTION_COLUMNS = `
  sa.auteur,
  sa.usager_nom,
  sa.usager_statut,
  sa.usager_faculte,
  sa.usager_courriel,
  sa.bibliothecaire_disciplinaire,
  sa.aviser_reservation,
  sa.aviser_reception,
  sa.date_requise_cours,
  sa.note_usager,
  sa.techdoc_suggestion_transmise,
  sa.acq_raison_annulation,
  sa.acq_isbn,
  sa.reserve_cours,
  sa.reserve_cours_sigle,
  sa.bordereau_imprime,
  sa.acq_responsable_courriel
`;

module.exports = {
  insertSuggestionAchat,
  updateSuggestionAchat,
  GET_FICHE_SUGGESTION_COLUMNS,
};
