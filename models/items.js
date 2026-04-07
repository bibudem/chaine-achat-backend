// ============================================================
// BACKEND — Champs suggestion d'achat (Node.js / Express + pg)
// À intégrer dans votre contrôleur/route items existant
// ============================================================

// ──────────────────────────────────────────────────────────────
// HELPER : extraction des champs spécifiques à suggestion_achat
// ──────────────────────────────────────────────────────────────
function extractSuggestionAchatData(specificData = {}) {
  return {
    justification:                specificData.justification                ?? null,
    public_cible:                 specificData.public_cible                 ?? null,
    recommandation:               specificData.recommandation               ?? false,
    // Nouveaux champs
    usager_nom:                   specificData.usager_nom                   ?? null,
    usager_statut:                specificData.usager_statut                ?? null,
    usager_faculte:               specificData.usager_faculte               ?? null,
    usager_courriel:              specificData.usager_courriel              ?? null,
    bibliothecaire_disciplinaire: specificData.bibliothecaire_disciplinaire ?? null,
    aviser_reservation:           specificData.aviser_reservation           ?? null,
    aviser_reception:             specificData.aviser_reception             ?? true,
    date_requise_cours:           specificData.date_requise_cours           || null,
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
      justification,
      public_cible,
      recommandation,
      usager_nom,
      usager_statut,
      usager_faculte,
      usager_courriel,
      bibliothecaire_disciplinaire,
      aviser_reservation,
      aviser_reception,
      date_requise_cours
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *;
  `;

  const values = [
    itemId,
    d.justification,
    d.public_cible,
    d.recommandation,
    d.usager_nom,
    d.usager_statut,
    d.usager_faculte,
    d.usager_courriel,
    d.bibliothecaire_disciplinaire,
    d.aviser_reservation,
    d.aviser_reception,
    d.date_requise_cours,
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
      justification                = $2,
      public_cible                 = $3,
      recommandation               = $4,
      usager_nom                   = $5,
      usager_statut                = $6,
      usager_faculte               = $7,
      usager_courriel              = $8,
      bibliothecaire_disciplinaire = $9,
      aviser_reservation           = $10,
      aviser_reception             = $11,
      date_requise_cours           = $12
    WHERE item_id = $1
    RETURNING *;
  `;

  const values = [
    itemId,
    d.justification,
    d.public_cible,
    d.recommandation,
    d.usager_nom,
    d.usager_statut,
    d.usager_faculte,
    d.usager_courriel,
    d.bibliothecaire_disciplinaire,
    d.aviser_reservation,
    d.aviser_reception,
    d.date_requise_cours,
  ];

  const result = await client.query(query, values);

  // Si la ligne n'existe pas encore (anciens items), on insère
  if (result.rowCount === 0) {
    return insertSuggestionAchat(client, itemId, specificData);
  }

  return result.rows[0];
}

// ──────────────────────────────────────────────────────────────
// SELECT  —  jointure à ajouter dans votre route GET /items/fiche/:id
// ──────────────────────────────────────────────────────────────
//
// Ajoutez ces colonnes à votre SELECT existant (LEFT JOIN déjà présent
// ou à ajouter si absent) :
//
//   LEFT JOIN tbl_suggestion_achat sa ON sa.item_id = i.item_id
//
// Colonnes à inclure dans le SELECT :
//   sa.justification,
//   sa.public_cible,
//   sa.recommandation,
//   sa.usager_nom,
//   sa.usager_statut,
//   sa.usager_faculte,
//   sa.usager_courriel,
//   sa.bibliothecaire_disciplinaire,
//   sa.aviser_reservation,
//   sa.aviser_reception,
//   sa.date_requise_cours
//
// Exemple de requête complète (à adapter à votre structure) :
const GET_FICHE_SUGGESTION_COLUMNS = `
  sa.justification,
  sa.public_cible,
  sa.recommandation,
  sa.usager_nom,
  sa.usager_statut,
  sa.usager_faculte,
  sa.usager_courriel,
  sa.bibliothecaire_disciplinaire,
  sa.aviser_reservation,
  sa.aviser_reception,
  sa.date_requise_cours
`;

// ──────────────────────────────────────────────────────────────
// INTÉGRATION dans le switch/case de votre contrôleur
// ──────────────────────────────────────────────────────────────
//
// Dans votre fonction handleSpecificData(client, itemId, type, specificData, isUpdate) :
//
//   case "Suggestion d'achat":
//     if (isUpdate) {
//       await updateSuggestionAchat(client, itemId, specificData);
//     } else {
//       await insertSuggestionAchat(client, itemId, specificData);
//     }
//     break;

module.exports = {
  insertSuggestionAchat,
  updateSuggestionAchat,
  GET_FICHE_SUGGESTION_COLUMNS,
};