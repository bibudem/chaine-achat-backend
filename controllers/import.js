const ExcelJS = require('exceljs');
const pool = require('../config/postgres.config');

console.log('🎯 Chargement du contrôleur import...');

// ==================== MAPPING TYPE → TABLE ====================
const TYPE_TABLE_MAP = {
  'Modification et CCOL': 'tbl_modification_ccol',
  'Nouvel abonnement':    'tbl_nouvel_abonnement',
  'Nouvel achat unique':  'tbl_nouvel_achat_unique',
  'PEB Tipasa numérique': 'tbl_peb_tipasa_numerique',
  'Requête ACQ Accessibilité': 'tbl_requete_acq',
  'Springer':             'tbl_springer',
  "Suggestion d'achat - Usager": 'tbl_suggestion_achat',
};

// ==================== HELPER : LIRE EXCEL DEPUIS BUFFER ====================
// Retourne un tableau d'objets { [en-tête]: valeur } identique à xlsx sheet_to_json
async function bufferToRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  // row.values est un tableau 1-indexé (index 0 = undefined)
  const headers = [];
  const rows    = [];

  worksheet.eachRow((row, rowNumber) => {
    const values = row.values;
    if (rowNumber === 1) {
      for (let i = 1; i < values.length; i++) {
        headers[i] = values[i] != null ? String(values[i]) : null;
      }
    } else {
      const rowData = {};
      for (let i = 1; i < headers.length; i++) {
        const header = headers[i];
        if (!header) continue;
        let value = values[i] ?? null;
        // Résoudre les résultats de formule
        if (value != null && typeof value === 'object' && 'result' in value) {
          value = value.result ?? null;
        }
        // Convertir les dates en YYYY-MM-DD (équivalent xlsx raw:false)
        if (value instanceof Date) {
          value = value.toISOString().split('T')[0];
        }
        rowData[header] = value;
      }
      rows.push(rowData);
    }
  });

  return rows;
}

// ==================== IMPORT EXCEL ====================
async function importExcel(req, res) {
  const client = await pool.connect();

  try {
    const formulaireType = decodeURIComponent(req.params.type);
    console.log(`➡️ POST /import/${formulaireType}`);

    // Vérifier le type
    if (!TYPE_TABLE_MAP[formulaireType]) {
      return res.status(400).json({
        success: false,
        error:   `Type de formulaire inconnu: "${formulaireType}"`,
        typesDisponibles: Object.keys(TYPE_TABLE_MAP)
      });
    }

    // Vérifier qu'un fichier a été envoyé
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier reçu. Envoyez un fichier Excel dans le champ "file".'
      });
    }

    console.log(`📄 Fichier reçu: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} Ko)`);

    // ── Parser le fichier Excel ─────────────────────────────────
    const rows = await bufferToRows(req.file.buffer);

    console.log(`📊 ${rows.length} ligne(s) détectée(s) dans le fichier`);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Le fichier est vide ou ne contient pas de données après la ligne d\'en-tête.'
      });
    }

    // ── Valider les colonnes obligatoires ──────────────────────
    const config = IMPORT_CONFIGS[formulaireType];
    const fileColumns = Object.keys(rows[0]);
    const missingCols = config.requiredColumns.filter(col => !fileColumns.includes(col));

    if (missingCols.length > 0) {
      return res.status(400).json({
        success: false,
        error:   `Colonnes obligatoires manquantes: ${missingCols.join(', ')}`,
        colonnesReçues:    fileColumns,
        colonnesRequises:  config.requiredColumns
      });
    }

    // ── Insérer ligne par ligne dans une transaction ──────────
    await client.query('BEGIN');

    const results = { inserted: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await insertRow(client, row, formulaireType, config);
        results.inserted++;
      } catch (rowErr) {
        console.error(`❌ Erreur ligne ${i + 2}:`, rowErr.message);
        results.errors.push({ ligne: i + 2, erreur: rowErr.message });
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Import terminé: ${results.inserted}/${rows.length} insérée(s), ${results.errors.length} erreur(s)`);

    res.status(201).json({
      success:  true,
      message:  `Import terminé: ${results.inserted} ligne(s) insérée(s) sur ${rows.length}`,
      inserted: results.inserted,
      total:    rows.length,
      errors:   results.errors
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur import Excel:', error);
    res.status(500).json({
      success: false,
      error:   error.message
    });
  } finally {
    client.release();
  }
}

// ==================== TÉLÉCHARGER LE MODÈLE EXCEL ====================
async function downloadTemplate(req, res) {
  try {
    const formulaireType = decodeURIComponent(req.params.type);
    console.log(`➡️ GET /import/template/${formulaireType}`);

    const config = IMPORT_CONFIGS[formulaireType];

    if (!config) {
      return res.status(404).json({
        success: false,
        error:   `Type inconnu: "${formulaireType}"`,
        typesDisponibles: Object.keys(IMPORT_CONFIGS)
      });
    }

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import');

    // Définir les colonnes avec en-têtes et largeur fixe
    worksheet.columns = config.templateHeaders.map(header => ({
      header,
      key:   header,
      width: 22,
    }));

    const buffer   = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `modele_import_${formulaireType.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

    console.log(`✅ Modèle généré: ${filename}`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ Erreur génération modèle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ==================== HELPER : INSÉRER UNE LIGNE ====================
async function insertRow(client, row, formulaireType, config) {
  // 1. Construire les données de base (tbl_items)
  const baseData = buildBaseData(row, formulaireType);

  // Filtrer les champs vides
  const cleanedBase = cleanEmptyFields(baseData);

  const itemColumns      = Object.keys(cleanedBase).join(', ');
  const itemValues       = Object.values(cleanedBase);
  const itemPlaceholders = itemValues.map((_, i) => `$${i + 1}`).join(', ');

  const itemQuery = `
    INSERT INTO tbl_items (${itemColumns})
    VALUES (${itemPlaceholders})
    RETURNING item_id
  `;

  const itemResult = await client.query(itemQuery, itemValues);
  const itemId     = itemResult.rows[0].item_id;

  console.log(`  ✅ Item créé avec ID: ${itemId}`);

  // 2. Insérer dans la table spécifique
  const specificData = config.buildSpecificData(row);
  const cleanedSpec  = cleanEmptyFields(specificData);

  if (Object.keys(cleanedSpec).length > 0) {
    const tableName  = TYPE_TABLE_MAP[formulaireType];
    const columns    = ['item_id', ...Object.keys(cleanedSpec)].join(', ');
    const values     = [itemId, ...Object.values(cleanedSpec)];
    const holders    = values.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet  = Object.keys(cleanedSpec)
      .map(key => `${key} = EXCLUDED.${key}`)
      .join(', ');

    const specificQuery = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${holders})
      ON CONFLICT (item_id) DO UPDATE SET ${updateSet}
    `;

    console.log(`  Insertion dans ${tableName}`);
    await client.query(specificQuery, values);
  }
}

// ==================== HELPER : DONNÉES DE BASE (tbl_items) ====================
function buildBaseData(row, formulaireType) {
  return {
    formulaire_type:              formulaireType,
    priorite_demande:             row['Priorité']               || null,
    titre_document:               row['Titre']                  || null,
    sous_titre:                   row['Sous-titre']             || null,
    isbn_issn:                    row['ISBN / ISSN']            || null,
    editeur:                      row['Éditeur']                || null,
    date_publication:             row['Date de publication']    || null,
    categorie_document:           row['Catégorie']              || null,
    format_support:               row['Format / Support']       || null,
    fonds_budgetaire:             row['Fonds budgétaire']       || null,
    fonds_sn_projet:              row['Fonds SN / Projet']      || null,
    bibliotheque:                 row['Bibliothèque']           || null,
    localisation_emplacement:     row['Localisation']           || null,
    demandeur:                    row['Demandeur']              || null,
    personne_a_aviser_nom:        row['Personne à aviser — Nom']      || row['Personne à aviser'] || null,
    personne_a_aviser_courriel:   row['Personne à aviser — Courriel'] || null,
    source_information:           row["Source d'information"]   || null,
    note_commentaire:             row['Note / Commentaire']     || null,
    creation_notice_dtdm:         parseBool(row['Création notice DTDM']),
    note_dtdm:                    row['Note DTDM']              || null,
    statut_bibliotheque:          row['Statut bibliothèque']    || null,
    statut_acq:                   row['Statut ACQ']             || null,
    catalogue:                    row['Catalogue']              || null,
    format_pret_numerique:        row['Format PrêtNumérique']   || null,
  };
}

// ==================== HELPER : NETTOYER LES CHAMPS VIDES ====================
function cleanEmptyFields(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      return value !== undefined && value !== null && value !== '';
    }).map(([key, value]) => {
      if (typeof value === 'string') return [key, value.trim()];
      return [key, value];
    })
  );
}

// ==================== HELPER : PARSE BOOLÉEN ====================
function parseBool(val) {
  if (val == null) return false;
  return ['oui', 'yes', '1', 'true', 'vrai'].includes(String(val).toLowerCase().trim());
}

// ==================== CONFIGURATIONS PAR TYPE ====================
// templateHeaders   : en-têtes du fichier Excel modèle (1re ligne)
// requiredColumns   : colonnes qui doivent être présentes ET remplies
// buildSpecificData : extrait les colonnes propres à la table spécifique

const COMMON_HEADERS = [
  'Titre', 'Sous-titre', 'ISBN / ISSN', 'Éditeur',
  'Date de publication', 'Catégorie', 'Format / Support',
  'Fonds budgétaire', 'Fonds SN / Projet', 'Bibliothèque',
  'Localisation', 'Demandeur', 'Personne à aviser',
  "Source d'information", 'Note / Commentaire',
  'Création notice DTDM', 'Note DTDM',
  'Statut bibliothèque', 'Statut ACQ', 'Catalogue'
];

const COMMON_REQUIRED = ['Titre', 'Demandeur', 'Bibliothèque'];

const IMPORT_CONFIGS = {

  // ── Nouvel achat unique ──────────────────────────────────────────
  'Nouvel achat unique': {
    requiredColumns: COMMON_REQUIRED,
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'ID Ressource', 'Projet spécial', 'Format PrêtNumérique',
      'Type monographie', 'Format électronique',
      'Réserve de cours', 'Sigle cours', 'Session cours', 'Enseignant',
      'Bordereau imprimé', 'Catégorie dépense', 'Note catalogueur (droit)'
    ],
    buildSpecificData: (row) => ({
      id_ressource:            row['ID Ressource']              || null,
      priorite_demande:        row['Priorité']                  || null,
      type_monographie:        row['Type monographie']          || null,
      format_electronique:     row['Format électronique']       || null,
      reserve_cours:           parseBool(row['Réserve de cours']),
      reserve_cours_sigle:     row['Sigle cours']               || null,
      reserve_cours_session:   row['Session cours']             || null,
      reserve_cours_enseignant:row['Enseignant']                || null,
      bordereau_imprime:       row['Bordereau imprimé']         || null,
      categorie_depense:       row['Catégorie dépense']         || null,
      note_catalogueur_droit:  row['Note catalogueur (droit)']  || null,
    })
  },

  // ── Nouvel abonnement ────────────────────────────────────────────
  'Nouvel abonnement': {
    requiredColumns: [...COMMON_REQUIRED, 'Date début abonnement'],
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial',
      'Date début abonnement', 'Type monographie', 'Collection', 'Catalogage'
    ],
    buildSpecificData: (row) => ({
      date_debut_abonnement: row['Date début abonnement'] || null,
      type_monographie:      row['Type monographie']      || null,
      collection:            row['Collection']            || null,
      catalogage:            row['Catalogage']            || null,
    })
  },

  // ── Modification et CCOL ─────────────────────────────────────────
  'Modification et CCOL': {
    requiredColumns: [...COMMON_REQUIRED, 'Précision demande'],
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial',
      'Précision demande', 'Numéro OCLC', 'Date début abonnement',
      'Collection', 'Catalogage'
    ],
    buildSpecificData: (row) => ({
      precision_demande:     row['Précision demande']      || '',
      numero_oclc:           row['Numéro OCLC']            || null,
      date_debut_abonnement: row['Date début abonnement']  || null,
      collection:            row['Collection']             || null,
      catalogage:            row['Catalogage']             || null,
    })
  },

  // ── PEB Tipasa numérique ─────────────────────────────────────────
  'PEB Tipasa numérique': {
    requiredColumns: COMMON_REQUIRED,
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial',
      'Type demande PEB', 'Référence Tipasa',
      'GOBI version < 365 USD', 'ACQ Responsable courriel'
    ],
    buildSpecificData: (row) => ({
      type_demande_peb:           row['Type demande PEB']         || null,
      reference_tipasa:           row['Référence Tipasa']         || null,
      gobi_version_moins_365_usd: row['GOBI version < 365 USD']  || null,
      acq_responsable_courriel:   row['ACQ Responsable courriel'] || null,
    })
  },

  // ── Requête ACQ Accessibilité ──────────────────────────────────────────────────
  'Requête ACQ Accessibilité': {
    requiredColumns: COMMON_REQUIRED,
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial', 'Format PrêtNumérique',
      'Référence usager', 'Besoin spécifique (format)', 'Type monographie',
      'Fournisseur contacté sans succès', 'Exemplaire détenu',
      'Vérification CAEB', 'Vérification SQLA', 'Vérification EMMA',
      'Permalien SOFIA', 'Numérisation recommandée',
      'Date demande éditeur', 'Date livraison estimée', 'ACQ Responsable courriel'
    ],
    buildSpecificData: (row) => ({
      reference_usager:                 row['Référence usager']               || null,
      besoin_specifique_format:         row['Besoin spécifique (format)']     || null,
      type_monographie:                 row['Type monographie']               || null,
      fournisseur_contacte_sans_succes: row['Fournisseur contacté sans succès'] || null,
      exemplaire_detenu:                row['Exemplaire détenu']              || null,
      verification_caeb:                row['Vérification CAEB']             || null,
      verification_sqla:                row['Vérification SQLA']             || null,
      verification_emma:                row['Vérification EMMA']             || null,
      permalien_sofia:                  row['Permalien SOFIA']               || null,
      acq_numerisation_recommandee:     row['Numérisation recommandée']      || null,
      acq_date_demande_editeur:         row['Date demande éditeur']          || null,
      acq_date_livraison_estimee:       row['Date livraison estimée']        || null,
      acq_responsable_courriel:         row['ACQ Responsable courriel']      || null,
    })
  },

  // ── Springer ─────────────────────────────────────────────────────
  'Springer': {
    requiredColumns: [...COMMON_REQUIRED, 'Quantité'],
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial', 'Quantité'
    ],
    buildSpecificData: (row) => ({
      quantite:       parseInt(row['Quantité'], 10) || 1,
    })
  },

  // ── Suggestion d'achat - Usager ───────────────────────────────────────────
  "Suggestion d'achat - Usager": {
    requiredColumns: COMMON_REQUIRED,
    templateHeaders: [
      'Priorité', ...COMMON_HEADERS, 'Projet spécial',
      'Justification', 'Public cible', 'Recommandation'
    ],
    buildSpecificData: (row) => ({
      justification:  row['Justification']  || null,
      public_cible:   row['Public cible']   || null,
      recommandation: parseBool(row['Recommandation']),
    })
  },
};

console.log('Contrôleur import initialisé avec succès');

module.exports = {
  importExcel,
  downloadTemplate,
};
