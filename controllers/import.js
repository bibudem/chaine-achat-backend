const ExcelJS        = require('exceljs');
const pool           = require('../config/postgres.config');
const ImportLogsModel = require('../models/import-logs');

console.log('🎯 Chargement du contrôleur import...');

const CHUNK_SIZE = 500;

// ==================== MAPPING TYPE → TABLE ====================
const TYPE_TABLE_MAP = {
  'Modification et CCOL':       'tbl_modification_ccol',
  'Nouvel abonnement':          'tbl_nouvel_abonnement',
  'Nouvel achat unique':        'tbl_nouvel_achat_unique',
  'PEB Tipasa numérique':       'tbl_peb_tipasa_numerique',
  'Requête ACQ Accessibilité':  'tbl_requete_acq',
  "Suggestion d'achat - Usager": 'tbl_suggestion_achat',
};

// ==================== HELPER : LIRE EXCEL DEPUIS BUFFER ====================
async function bufferToRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

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
        if (value != null && typeof value === 'object' && 'result' in value) {
          value = value.result ?? null;
        }
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

    if (!TYPE_TABLE_MAP[formulaireType]) {
      return res.status(400).json({
        success: false,
        error:   `Type de formulaire inconnu: "${formulaireType}"`,
        typesDisponibles: Object.keys(TYPE_TABLE_MAP)
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier reçu. Envoyez un fichier Excel dans le champ "file".'
      });
    }

    console.log(`📄 Fichier reçu: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} Ko)`);

    const rows = await bufferToRows(req.file.buffer);

    console.log(`📊 ${rows.length} ligne(s) détectée(s) dans le fichier`);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Le fichier est vide ou ne contient pas de données après la ligne d'en-tête."
      });
    }

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

    // ── Phase 1 : validation mémoire (sans DB) ────────────────────────────────
    const errors     = [];
    const validPairs = [];

    for (let i = 0; i < rows.length; i++) {
      const rowError = validateRow(rows[i], config, i + 2);
      if (rowError) {
        errors.push(rowError);
      } else {
        validPairs.push({ row: rows[i], line: i + 2 });
      }
    }

    if (validPairs.length === 0) {
      return res.status(400).json({
        success: false,
        error:   'Aucune ligne valide à importer.',
        errors
      });
    }

    // ── Phase 2 : insertions en lots dans une transaction ─────────────────────
    await client.query('BEGIN');

    let inserted = 0;

    for (let c = 0; c < validPairs.length; c += CHUNK_SIZE) {
      const chunk     = validPairs.slice(c, c + CHUNK_SIZE);
      const chunkRows = chunk.map(p => p.row);

      try {
        await insertChunk(client, chunkRows, formulaireType, config);
        inserted += chunk.length;
      } catch (chunkErr) {
        // Un conflit ou une contrainte DB dans le lot → bascule ligne par ligne
        console.warn(
          `⚠️ Lot [lignes ${chunk[0].line}–${chunk[chunk.length - 1].line}] échoué ` +
          `(${chunkErr.message}), bascule en insertion individuelle`
        );
        // Annuler uniquement le lot en cours, pas toute la transaction
        await client.query('SAVEPOINT chunk_fallback');
        for (const { row, line } of chunk) {
          try {
            await insertRow(client, row, formulaireType, config);
            inserted++;
          } catch (rowErr) {
            await client.query('ROLLBACK TO SAVEPOINT chunk_fallback');
            await client.query('SAVEPOINT chunk_fallback');
            errors.push({ ligne: line, erreur: rowErr.message });
          }
        }
        await client.query('RELEASE SAVEPOINT chunk_fallback');
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Import terminé: ${inserted}/${rows.length} insérée(s), ${errors.length} erreur(s)`);

    const statut = errors.length === 0  ? 'succès'
                 : inserted     === 0   ? 'échec'
                 : 'partiel';

    ImportLogsModel.create({
      formulaire_type: formulaireType,
      fichier_nom:     req.file.originalname,
      nb_total:        rows.length,
      nb_inseres:      inserted,
      nb_erreurs:      errors.length,
      details_erreurs: errors,
      utilisateur:     req.body?.utilisateur || 'Inconnu',
      statut
    }).catch(e => console.warn('[import-log] impossible de sauvegarder le log:', e.message));

    res.status(201).json({
      success:  true,
      message:  `Import terminé: ${inserted} ligne(s) insérée(s) sur ${rows.length}`,
      inserted,
      total:    rows.length,
      errors
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur import Excel:', error);

    ImportLogsModel.create({
      formulaire_type: req.params?.type ? decodeURIComponent(req.params.type) : 'Inconnu',
      fichier_nom:     req.file?.originalname || 'inconnu',
      nb_total:        0,
      nb_inseres:      0,
      nb_erreurs:      1,
      details_erreurs: [{ ligne: 0, erreur: error.message }],
      utilisateur:     req.body?.utilisateur || 'Inconnu',
      statut:          'échec'
    }).catch(e => console.warn('[import-log] impossible de sauvegarder le log d\'erreur:', e.message));

    res.status(500).json({ success: false, error: error.message });
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

// ==================== HELPER : VALIDER UNE LIGNE EN MÉMOIRE ====================
function validateRow(row, config, lineNumber) {
  const missing = config.requiredColumns.filter(col => {
    const v = row[col];
    return v == null || String(v).trim() === '';
  });
  if (missing.length === 0) return null;
  return { ligne: lineNumber, erreur: `Champs obligatoires manquants: ${missing.join(', ')}` };
}

// ==================== HELPER : INSÉRER UN LOT ====================
// Construit un INSERT multi-valeurs pour tbl_items (RETURNING item_id),
// puis un INSERT multi-valeurs pour la table spécifique — 2 requêtes pour N lignes.
async function insertChunk(client, rows, formulaireType, config) {
  if (rows.length === 0) return;

  const tableName = TYPE_TABLE_MAP[formulaireType];

  // ── tbl_items ─────────────────────────────────────────────────────
  // La liste de colonnes est fixe pour tous les types (même structure buildBaseData)
  const BASE_COLUMNS = Object.keys(buildBaseData({}, formulaireType));
  const itemValues   = [];

  const itemPlaceholders = rows.map((row, rowIdx) => {
    const base   = buildBaseData(row, formulaireType);
    const offset = rowIdx * BASE_COLUMNS.length;
    BASE_COLUMNS.forEach(col => itemValues.push(normalizeValue(base[col])));
    return `(${BASE_COLUMNS.map((_, i) => `$${offset + i + 1}`).join(', ')})`;
  }).join(', ');

  const itemResult = await client.query(
    `INSERT INTO tbl_items (${BASE_COLUMNS.join(', ')}) VALUES ${itemPlaceholders} RETURNING item_id`,
    itemValues
  );
  const itemIds = itemResult.rows.map(r => r.item_id);

  // ── Table spécifique ──────────────────────────────────────────────
  const SPEC_COLUMNS = Object.keys(config.buildSpecificData({}));
  if (SPEC_COLUMNS.length === 0) return;

  const ALL_COLS  = ['item_id', ...SPEC_COLUMNS];
  const specValues = [];

  const specPlaceholders = rows.map((row, rowIdx) => {
    const spec   = config.buildSpecificData(row);
    const offset = rowIdx * ALL_COLS.length;
    specValues.push(itemIds[rowIdx]);
    SPEC_COLUMNS.forEach(col => specValues.push(normalizeValue(spec[col])));
    return `(${ALL_COLS.map((_, i) => `$${offset + i + 1}`).join(', ')})`;
  }).join(', ');

  const updateSet = SPEC_COLUMNS.map(col => `${col} = EXCLUDED.${col}`).join(', ');

  await client.query(
    `INSERT INTO ${tableName} (${ALL_COLS.join(', ')}) VALUES ${specPlaceholders} ON CONFLICT (item_id) DO UPDATE SET ${updateSet}`,
    specValues
  );
}

// ==================== HELPER : INSÉRER UNE LIGNE (fallback) ====================
async function insertRow(client, row, formulaireType, config) {
  const baseData    = buildBaseData(row, formulaireType);
  const cleanedBase = cleanEmptyFields(baseData);

  const itemColumns      = Object.keys(cleanedBase).join(', ');
  const itemValues       = Object.values(cleanedBase);
  const itemPlaceholders = itemValues.map((_, i) => `$${i + 1}`).join(', ');

  const itemResult = await client.query(
    `INSERT INTO tbl_items (${itemColumns}) VALUES (${itemPlaceholders}) RETURNING item_id`,
    itemValues
  );
  const itemId = itemResult.rows[0].item_id;

  const specificData = config.buildSpecificData(row);
  const cleanedSpec  = cleanEmptyFields(specificData);

  if (Object.keys(cleanedSpec).length > 0) {
    const tableName = TYPE_TABLE_MAP[formulaireType];
    const columns   = ['item_id', ...Object.keys(cleanedSpec)].join(', ');
    const values    = [itemId, ...Object.values(cleanedSpec)];
    const holders   = values.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = Object.keys(cleanedSpec)
      .map(key => `${key} = EXCLUDED.${key}`)
      .join(', ');

    await client.query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${holders}) ON CONFLICT (item_id) DO UPDATE SET ${updateSet}`,
      values
    );
  }
}

// ==================== HELPER : DONNÉES DE BASE (tbl_items) ====================
function buildBaseData(row, formulaireType) {
  return {
    formulaire_type:              formulaireType,
    priorite_demande:             row['priorite_demande']            || null,
    titre_document:               row['titre_document']              || null,
    sous_titre:                   row['sous_titre']                  || null,
    isbn_issn:                    row['isbn_issn']                   || null,
    editeur:                      row['editeur']                     || null,
    date_publication:             row['date_publication']            || null,
    categorie_document:           row['categorie_document']          || null,
    format_support:               row['format_support']              || null,
    fonds_budgetaire:             row['fonds_budgetaire']            || null,
    fonds_sn_projet:              row['fonds_sn_projet']             || null,
    bibliotheque:                 row['bibliotheque']                || null,
    localisation_emplacement:     row['localisation_emplacement']    || null,
    demandeur:                    row['demandeur']                   || null,
    prix_cad:                     row['prix_cad']            ? parseFloat(row['prix_cad']) : null,
    devise_originale:             row['devise_originale']            || null,
    prix_devise_originale:        row['prix_devise_originale'] ? parseFloat(row['prix_devise_originale']) : null,
    personne_a_aviser_nom:        row['personne_a_aviser_nom']       || null,
    personne_a_aviser_courriel:   row['personne_a_aviser_courriel']  || null,
    source_information:           row['source_information']          || null,
    note_commentaire:             row['note_commentaire']            || null,
    creation_notice_dtdm:         parseBool(row['creation_notice_dtdm']),
    note_dtdm:                    row['note_dtdm']                   || null,
    statut_bibliotheque:          row['statut_bibliotheque']         || null,
    statut_acq:                   row['statut_acq']                  || null,
    suivi_acq:                    row['suivi_acq']                   || null,
    note_acq:                     row['note_acq']                    || null,
    bibliotheque_note_interne:    row['bibliotheque_note_interne']   || null,
    catalogue:                    row['catalogue']                   || null,
    format_pret_numerique:        row['format_pret_numerique']       || null,
  };
}

// ==================== HELPER : NORMALISER UNE VALEUR POUR INSERT EN LOT ====================
// Contrairement à cleanEmptyFields, on garde les null explicitement (liste de colonnes fixe).
function normalizeValue(v) {
  if (v === undefined || v === '') return null;
  if (typeof v === 'string')       return v.trim() || null;
  return v;
}

// ==================== HELPER : NETTOYER LES CHAMPS VIDES (fallback individuel) ====================
function cleanEmptyFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  );
}

// ==================== HELPER : PARSE BOOLÉEN ====================
function parseBool(val) {
  if (val == null) return false;
  return ['oui', 'yes', '1', 'true', 'vrai'].includes(String(val).toLowerCase().trim());
}

// ==================== CONFIGURATIONS PAR TYPE ====================
const COMMON_HEADERS = [
  'titre_document', 'sous_titre', 'isbn_issn', 'editeur',
  'date_publication', 'categorie_document', 'format_support',
  'fonds_budgetaire', 'fonds_sn_projet', 'bibliotheque',
  'localisation_emplacement', 'demandeur',
  'prix_cad', 'devise_originale', 'prix_devise_originale',
  'personne_a_aviser_nom',
  'source_information', 'note_commentaire',
  'creation_notice_dtdm', 'note_dtdm',
  'statut_bibliotheque', 'statut_acq', 'suivi_acq', 'note_acq',
  'bibliotheque_note_interne', 'catalogue'
];

const COMMON_REQUIRED = ['titre_document', 'demandeur', 'bibliotheque', 'isbn_issn'];

const IMPORT_CONFIGS = {

  // ── Nouvel achat unique ──────────────────────────────────────────
  'Nouvel achat unique': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale',
      'date_publication', 'source_information'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS,
      'id_ressource', 'projet_special', 'format_pret_numerique',
      'type_monographie', 'format_electronique',
      'reserve_cours', 'reserve_cours_sigle', 'reserve_cours_session', 'reserve_cours_enseignant',
      'bordereau_imprime', 'categorie_depense', 'note_catalogueur_droit'
    ],
    buildSpecificData: (row) => ({
      id_ressource:             row['id_ressource']             || null,
      type_monographie:         row['type_monographie']         || null,
      format_electronique:      row['format_electronique']      || null,
      reserve_cours:            parseBool(row['reserve_cours']),
      reserve_cours_sigle:      row['reserve_cours_sigle']      || null,
      reserve_cours_session:    row['reserve_cours_session']    || null,
      reserve_cours_enseignant: row['reserve_cours_enseignant'] || null,
      bordereau_imprime:        row['bordereau_imprime']        || null,
      categorie_depense:        row['categorie_depense']        || null,
      note_catalogueur_droit:   row['note_catalogueur_droit']   || null,
    })
  },

  // ── Nouvel abonnement ────────────────────────────────────────────
  'Nouvel abonnement': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale',
      'source_information', 'date_debut_abonnement'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, 'projet_special',
      'date_debut_abonnement', 'type_monographie',
      'usager_aviser_reservation'
    ],
    buildSpecificData: (row) => ({
      date_debut_abonnement:     row['date_debut_abonnement']     || null,
      type_monographie:          row['type_monographie']          || null,
      usager_aviser_reservation: row['usager_aviser_reservation'] || null,
    })
  },

  // ── Modification et CCOL ─────────────────────────────────────────
  'Modification et CCOL': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale',
      'source_information', 'precision_demande'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, 'projet_special',
      'precision_demande', 'numero_oclc', 'date_debut_abonnement',
       'usager_aviser_activation'
    ],
    buildSpecificData: (row) => ({
      precision_demande:        row['precision_demande']        || '',
      numero_oclc:              row['numero_oclc']              || null,
      date_debut_abonnement:    row['date_debut_abonnement']    || null,
      usager_aviser_activation: row['usager_aviser_activation'] || null,
    })
  },

  // ── PEB Tipasa numérique ─────────────────────────────────────────
  'PEB Tipasa numérique': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale',
      'source_information', 'gobi_vu_format_numerique'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, 'projet_special',
      'type_demande_peb', 'reference_tipasa',
      'gobi_vu_format_numerique', 'gobi_version_moins_365_usd', 'acq_responsable_courriel'
    ],
    buildSpecificData: (row) => ({
      type_demande_peb:           row['type_demande_peb']           || null,
      reference_tipasa:           row['reference_tipasa']           || null,
      gobi_vu_format_numerique:   row['gobi_vu_format_numerique']   || null,
      gobi_version_moins_365_usd: row['gobi_version_moins_365_usd'] || null,
      acq_responsable_courriel:   row['acq_responsable_courriel']   || null,
    })
  },

  // ── Requête ACQ Accessibilité ────────────────────────────────────
  'Requête ACQ Accessibilité': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale', 'source_information'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, 'projet_special', 'format_pret_numerique',
      'reference_usager', 'besoin_specifique_format', 'type_monographie',
      'fournisseur_contacte_sans_succes', 'exemplaire_detenu',
      'verification_caeb', 'verification_sqla', 'verification_emma',
      'permalien_sofia', 'acq_numerisation_recommandee',
      'acq_date_demande_editeur', 'acq_date_livraison_estimee', 'acq_responsable_courriel'
    ],
    buildSpecificData: (row) => ({
      reference_usager:                 row['reference_usager']                 || null,
      besoin_specifique_format:         row['besoin_specifique_format']          || null,
      type_monographie:                 row['type_monographie']                  || null,
      fournisseur_contacte_sans_succes: row['fournisseur_contacte_sans_succes']  || null,
      exemplaire_detenu:                row['exemplaire_detenu']                 || null,
      verification_caeb:                row['verification_caeb']                 || null,
      verification_sqla:                row['verification_sqla']                 || null,
      verification_emma:                row['verification_emma']                 || null,
      permalien_sofia:                  row['permalien_sofia']                   || null,
      acq_numerisation_recommandee:     row['acq_numerisation_recommandee']      || null,
      acq_date_demande_editeur:         row['acq_date_demande_editeur']          || null,
      acq_date_livraison_estimee:       row['acq_date_livraison_estimee']        || null,
      acq_responsable_courriel:         row['acq_responsable_courriel']          || null,
    })
  },

  // ── Suggestion d'achat - Usager ──────────────────────────────────
  "Suggestion d'achat - Usager": {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support', 'fonds_budgetaire',
      'prix_cad', 'devise_originale', 'prix_devise_originale', 'source_information',
      'auteur', 'usager_statut', 'usager_faculte',
      'usager_courriel', 'bibliothecaire_disciplinaire'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS,
      'auteur', 'usager_nom', 'usager_statut', 'usager_faculte',
      'usager_courriel', 'bibliothecaire_disciplinaire',
      'acq_isbn', 'date_requise_cours',
      'reserve_cours', 'reserve_cours_sigle',
      'bordereau_imprime', 'aviser_reservation', 'aviser_reception',
      'note_usager', 'techdoc_suggestion_transmise',
      'acq_responsable_courriel', 'acq_raison_annulation'
    ],
    buildSpecificData: (row) => ({
      auteur:                       row['auteur']                       || null,
      usager_nom:                   row['usager_nom']                   || null,
      usager_statut:                row['usager_statut']                || null,
      usager_faculte:               row['usager_faculte']               || null,
      usager_courriel:              row['usager_courriel']              || null,
      bibliothecaire_disciplinaire: row['bibliothecaire_disciplinaire'] || null,
      acq_isbn:                     row['acq_isbn']                     || null,
      date_requise_cours:           row['date_requise_cours']           || null,
      reserve_cours:                parseBool(row['reserve_cours']),
      reserve_cours_sigle:          row['reserve_cours_sigle']          || null,
      bordereau_imprime:            row['bordereau_imprime']            || null,
      aviser_reservation:           parseBool(row['aviser_reservation']),
      aviser_reception:             parseBool(row['aviser_reception']),
      note_usager:                  row['note_usager']                  || null,
      techdoc_suggestion_transmise: parseBool(row['techdoc_suggestion_transmise']),
      acq_responsable_courriel:     row['acq_responsable_courriel']     || null,
      acq_raison_annulation:        row['acq_raison_annulation']        || null,
    })
  },
};

console.log('Contrôleur import initialisé avec succès');

module.exports = {
  importExcel,
  downloadTemplate,
};
