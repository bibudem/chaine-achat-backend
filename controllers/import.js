const ExcelJS        = require('exceljs');
const pool           = require('../config/postgres.config');
const ImportLogsModel = require('../models/import-logs');
const ItemsFondsModel = require('../models/items-fonds');
const { publicError } = require('../util/errors');

console.log('🎯 Chargement du contrôleur import...');

// ==================== MAPPING TYPE → TABLE ====================
const TYPE_TABLE_MAP = {
  'Modification et CCOL':       'tbl_modification_ccol',
  'Nouvel abonnement':          'tbl_nouvel_abonnement',
  'Nouvel achat unique':        'tbl_nouvel_achat_unique',
  'PEB Tipasa numérique':       'tbl_peb_tipasa_numerique',
  'Requête ACQ Accessibilité':  'tbl_requete_acq',
  "Suggestion d'achat - Usager": 'tbl_suggestion_achat',
};

// ==================== HELPER : LONGUEURS MAX DES COLONNES (messages d'erreur clairs) ====================
let columnMaxLengthsCache = null;
async function getColumnMaxLengths() {
  if (columnMaxLengthsCache) return columnMaxLengthsCache;
  const tables = ['tbl_items', ...Object.values(TYPE_TABLE_MAP)];
  const { rows } = await pool.query(
    `SELECT table_name, column_name, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1) AND character_maximum_length IS NOT NULL`,
    [tables]
  );
  const map = {};
  rows.forEach(r => {
    map[r.table_name] = map[r.table_name] || {};
    map[r.table_name][r.column_name] = r.character_maximum_length;
  });
  columnMaxLengthsCache = map;
  return map;
}

// ==================== HELPER : MESSAGE D'ERREUR CLAIR (français, court) ====================
// Traduit une erreur Postgres brute (code SQLSTATE) en message court et compréhensible pour
// un admin qui ne connaît pas la base de données — au lieu du message technique du pilote pg.
async function messageErreurClair(err, data, tableName) {
  switch (err.code) {
    case '23502': // NOT NULL violation — pg fournit le nom de colonne directement
      return `Champ obligatoire manquant : « ${err.column || '?'} ».`;
    case '23505':
      return 'Doublon : cette ligne existe déjà.';
    case '23503':
      return 'Référence invalide (donnée liée introuvable).';
    case '22P02':
      return 'Format invalide pour une valeur (nombre, date ou texte attendu).';
    case '22003':
      return 'Un nombre est trop grand pour son champ.';
    case '22001': { // valeur trop longue — on identifie le champ fautif via les longueurs max
      const limits = (await getColumnMaxLengths())[tableName] || {};
      const champFautif = Object.keys(data || {}).find(col => {
        const max = limits[col];
        const val = data[col];
        return max != null && val != null && String(val).length > max;
      });
      return champFautif
        ? `Champ « ${champFautif} » trop long (max ${limits[champFautif]} caractères).`
        : 'Une valeur est trop longue pour son champ.';
    }
    default:
      return err.message;
  }
}

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

    // ── Phase 2 : upsert ligne par ligne dans une transaction ─────────────────
    // Chaque ligne est traitée individuellement (voir upsertRow) car la déduplication
    // (même formulaire_type + titre + ISBN → mise à jour au lieu d'un doublon) nécessite une
    // recherche préalable par ligne, incompatible avec un INSERT multi-valeurs en un seul lot.
    // Le SAVEPOINT par ligne isole une éventuelle erreur (ex. champ trop long) sans faire
    // échouer les autres lignes ni toute la transaction.
    await client.query('BEGIN');

    let nouveaux = 0; // vraies créations
    let maj      = 0; // items existants mis à jour (déduplication titre+ISBN)
    const insertedItemIds = [];

    for (const { row, line } of validPairs) {
      await client.query('SAVEPOINT row_attempt');
      try {
        const result = await upsertRow(client, row, formulaireType, config);
        insertedItemIds.push(result.itemId);
        if (result.updated) maj++; else nouveaux++;
        await client.query('RELEASE SAVEPOINT row_attempt');
      } catch (rowErr) {
        await client.query('ROLLBACK TO SAVEPOINT row_attempt');
        await client.query('RELEASE SAVEPOINT row_attempt');
        errors.push({ ligne: line, erreur: rowErr.message });
      }
    }

    await client.query('COMMIT');

    const traites = nouveaux + maj;
    console.log(
      `✅ Import terminé: ${nouveaux} créée(s), ${maj} mise(s) à jour ` +
      `sur ${rows.length}, ${errors.length} erreur(s)`
    );

    const statut = errors.length === 0 ? 'succès'
                 : traites       === 0 ? 'échec'
                 : 'partiel';

    let logId = null;
    try {
      const logRow = await ImportLogsModel.create({
        formulaire_type: formulaireType,
        fichier_nom:     req.file.originalname,
        nb_total:        rows.length,
        nb_inseres:      nouveaux,
        nb_maj:          maj,
        nb_erreurs:      errors.length,
        details_erreurs: errors,
        utilisateur:     req.body?.utilisateur || 'Inconnu',
        statut
      });
      logId = logRow?.log_id ?? null;
    } catch (logErr) {
      console.error('[import-log] impossible de sauvegarder le log:', logErr.message);
    }

    // Relie chaque item créé/mis à jour au log d'import — permet de filtrer /items par
    // import (bouton "Voir les items importés"). Non bloquant : l'import a déjà été commité.
    if (logId && insertedItemIds.length > 0) {
      try {
        await pool.query(
          `UPDATE tbl_items SET import_log_id = $1 WHERE item_id = ANY($2)`,
          [logId, insertedItemIds]
        );
      } catch (linkErr) {
        console.error('[import-log] impossible de lier les items importés au log:', linkErr.message);
      }
    }

    res.status(201).json({
      success:  true,
      message:  `Import terminé: ${nouveaux} créée(s), ${maj} mise(s) à jour, sur ${rows.length}`,
      inserted: nouveaux,
      updated:  maj,
      total:    rows.length,
      errors,
      logId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur import Excel:', error);

    try {
      await ImportLogsModel.create({
        formulaire_type: req.params?.type ? decodeURIComponent(req.params.type) : 'Inconnu',
        fichier_nom:     req.file?.originalname || 'inconnu',
        nb_total:        0,
        nb_inseres:      0,
        nb_erreurs:      1,
        details_erreurs: [{ ligne: 0, erreur: error.message }],
        utilisateur:     req.body?.utilisateur || 'Inconnu',
        statut:          'échec'
      });
    } catch (logErr) {
      console.error('[import-log] impossible de sauvegarder le log d\'erreur:', logErr.message);
    }

    res.status(500).json({ success: false, error: publicError(error) });
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
    res.status(500).json({ success: false, error: publicError(error) });
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

// ==================== HELPER : TROUVER UN ITEM EXISTANT (déduplication import) ====================
// Un import répété du même fichier (ou une ligne déjà importée précédemment) créait un
// doublon à chaque exécution. On recherche maintenant un item existant du MÊME type de
// formulaire, même titre et même ISBN/ISSN (comparaison insensible à la casse/aux espaces) —
// s'il existe, upsertRow() le MET À JOUR au lieu d'en créer un nouveau. Le type de formulaire
// fait partie du critère pour éviter qu'un même titre/ISBN utilisé pour une demande d'un
// AUTRE type (ex. abonnement vs achat unique) ne vienne écraser une fiche sans rapport.
async function findExistingItemId(client, formulaireType, titre_document, isbn_issn) {
  if (!titre_document || !isbn_issn) return null; // pas assez d'info pour matcher en confiance
  const { rows } = await client.query(
    `SELECT item_id FROM tbl_items
     WHERE formulaire_type = $1
       AND lower(trim(titre_document)) = lower(trim($2))
       AND lower(trim(isbn_issn))      = lower(trim($3))
     LIMIT 1`,
    [formulaireType, titre_document, isbn_issn]
  );
  return rows[0]?.item_id ?? null;
}

// ==================== HELPER : INSÉRER OU METTRE À JOUR UNE LIGNE ====================
// Retourne { itemId, updated } — updated=true si une ligne existante (même formulaire_type +
// titre + ISBN/ISSN, voir findExistingItemId) a été mise à jour plutôt que dupliquée.
// Ne met à jour que les champs présents dans la ligne importée (cleanEmptyFields) : une
// cellule vide dans le fichier ne vient pas effacer une valeur déjà en base.
async function upsertRow(client, row, formulaireType, config) {
  const baseData    = buildBaseData(row, formulaireType);

  // Fonds partagés (Nouvel achat unique / Nouvel abonnement / Modification et CCOL
  // uniquement, voir buildFondsRepartition) — remplace prix_cad par la somme des fonds
  // quand un vrai partage est détecté dans la ligne (≥ 2 fonds valides).
  const fondsRepartition = buildFondsRepartition(row);
  if (fondsRepartition) {
    baseData.prix_cad = fondsRepartition.reduce((s, l) => s + (Number(l.prix_cad) || 0), 0);
  }

  const cleanedBase = cleanEmptyFields(baseData);

  const existingId = await findExistingItemId(
    client, formulaireType, baseData.titre_document, baseData.isbn_issn
  );

  let itemId;
  if (existingId) {
    const columns    = Object.keys(cleanedBase);
    const values     = columns.map(col => cleanedBase[col]);
    const setClauses = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');

    try {
      await client.query(
        `UPDATE tbl_items SET ${setClauses}, date_modification = CURRENT_TIMESTAMP WHERE item_id = $1`,
        [existingId, ...values]
      );
    } catch (err) {
      throw new Error(await messageErreurClair(err, cleanedBase, 'tbl_items'));
    }
    itemId = existingId;
  } else {
    const itemColumns      = Object.keys(cleanedBase).join(', ');
    const itemValues       = Object.values(cleanedBase);
    const itemPlaceholders = itemValues.map((_, i) => `$${i + 1}`).join(', ');

    try {
      const itemResult = await client.query(
        `INSERT INTO tbl_items (${itemColumns}) VALUES (${itemPlaceholders}) RETURNING item_id`,
        itemValues
      );
      itemId = itemResult.rows[0].item_id;
    } catch (err) {
      throw new Error(await messageErreurClair(err, cleanedBase, 'tbl_items'));
    }
  }

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

    try {
      await client.query(
        `INSERT INTO ${tableName} (${columns}) VALUES (${holders}) ON CONFLICT (item_id) DO UPDATE SET ${updateSet}`,
        values
      );
    } catch (err) {
      throw new Error(await messageErreurClair(err, cleanedSpec, tableName));
    }
  }

  // Fonds partagés : ne fait rien si fondsRepartition est undefined (pas de partage détecté
  // dans cette ligne) — voir ItemsFondsModel.remplacerRepartition.
  await ItemsFondsModel.remplacerRepartition(client, itemId, fondsRepartition);

  return { itemId, updated: !!existingId };
}

// ==================== HELPER : RÉPARTITION FONDS PARTAGÉS ====================
// Nouvel achat unique / Nouvel abonnement / Modification et CCOL uniquement (voir
// sql/items_fonds.sql). Pas de colonnes séparées par fonds : les MÊMES colonnes
// (fonds_budgetaire, prix_cad, devise_originale, prix_devise_originale, pourcentage)
// portent plusieurs valeurs séparées par "; " (ou juste ";"), dans le même ordre pour
// chaque colonne — ex. fonds_budgetaire = "PE-034;PE-028", prix_cad = "20;15". Une
// cellule sans ";" reste une simple valeur unique (comportement à 1 fonds inchangé).
// Un segment n'est retenu que si fonds_budgetaire/prix_cad/devise_originale/
// prix_devise_originale sont TOUS renseignés à cette position ; pourcentage reste
// purement informatif (comme dans les formulaires web — non bloquant). Ne renvoie un
// tableau que s'il y a un vrai partage (≥ 2 segments valides au total), sinon
// undefined, pour ne pas créer de ligne dans tbl_items_fonds quand un seul fonds
// suffit (voir models/items-fonds.js : remplacerRepartition ne fait rien avec < 2
// lignes).
function decouperColonne(val) {
  if (val == null || val === '') return [];
  return String(val).split(';').map(s => s.trim()).filter(s => s !== '');
}

/** Premier segment d'une colonne pouvant contenir plusieurs valeurs séparées par ";" —
 *  utilisé par buildBaseData pour ne garder que le fonds "représentatif" (le 1er) dans
 *  les colonnes plates de tbl_items, qu'il y ait un partage ou non. */
function premierSegment(val) {
  const segments = decouperColonne(val);
  return segments.length ? segments[0] : null;
}

function buildFondsRepartition(row) {
  const fondsArr  = decouperColonne(row['fonds_budgetaire']);
  const prixArr   = decouperColonne(row['prix_cad']);
  const deviseArr = decouperColonne(row['devise_originale']);
  const prixDevArr = decouperColonne(row['prix_devise_originale']);
  const pctArr    = decouperColonne(row['pourcentage']);

  const nbSegments = Math.max(fondsArr.length, prixArr.length, deviseArr.length, prixDevArr.length, pctArr.length);
  if (nbSegments < 2) return undefined;

  const lignes = [];
  for (let i = 0; i < nbSegments; i++) {
    const fonds_budgetaire      = fondsArr[i];
    const prix_cad              = prixArr[i];
    const devise_originale      = deviseArr[i];
    const prix_devise_originale = prixDevArr[i];
    if (!fonds_budgetaire || !prix_cad || !devise_originale || !prix_devise_originale) continue;
    lignes.push({
      fonds_budgetaire,
      prix_cad:              parseFloat(prix_cad),
      devise_originale,
      prix_devise_originale: parseFloat(prix_devise_originale),
      pourcentage:           pctArr[i] ? parseFloat(pctArr[i]) : null,
    });
  }
  if (lignes.length < 2) return undefined;

  // tbl_items_fonds.pourcentage est NOT NULL (voir sql/items_fonds.sql) et
  // remplacerRepartition() rejette toute ligne avec pourcentage <= 0/null — un segment
  // pourcentage laissé vide dans le fichier Excel ferait donc disparaître ce fonds de la
  // répartition (pas juste son pourcentage). Valeur de repli : répartition égale entre les
  // fonds dont le pourcentage n'a pas été renseigné.
  lignes.forEach(l => {
    if (l.pourcentage == null) l.pourcentage = Math.round((100 / lignes.length) * 100) / 100;
  });

  return lignes;
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
    // premierSegment : si la cellule contient un partage de fonds ("PE-034;PE-028"), seul
    // le 1er fonds sert de valeur "représentative" pour ces colonnes plates de tbl_items —
    // voir buildFondsRepartition. Une cellule sans ";" reste inchangée (1 seul segment).
    fonds_budgetaire:             premierSegment(row['fonds_budgetaire']),
    fonds_sn_projet:              row['fonds_sn_projet']             || null,
    bibliotheque:                 row['bibliotheque']                || null,
    localisation_emplacement:     row['localisation_emplacement']    || null,
    demandeur:                    row['demandeur']                   || null,
    prix_cad:                     premierSegment(row['prix_cad']) ? parseFloat(premierSegment(row['prix_cad'])) : null,
    devise_originale:             premierSegment(row['devise_originale']),
    prix_devise_originale:        premierSegment(row['prix_devise_originale']) ? parseFloat(premierSegment(row['prix_devise_originale'])) : null,
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

// ==================== HELPER : NETTOYER LES CHAMPS VIDES ====================
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
  'bibliotheque', 'localisation_emplacement', 'demandeur',
  // Informations financières — champs regroupés, dans le même ordre que les
  // formulaires web (voir item-formulaire.component.html) : Devise, Prix (devise
  // originale), Prix CAD, Fonds budgétaire, Fonds SN.
  'devise_originale', 'prix_devise_originale', 'prix_cad',
  'fonds_budgetaire', 'fonds_sn_projet',
  'personne_a_aviser_nom',
  'source_information', 'note_commentaire',
  'creation_notice_dtdm', 'note_dtdm',
  'statut_bibliotheque', 'statut_acq', 'suivi_acq', 'note_acq',
  'bibliotheque_note_interne', 'catalogue'
];

const COMMON_REQUIRED = ['titre_document', 'demandeur', 'bibliotheque', 'isbn_issn'];

// Colonne optionnelle pour répartir un item entre plusieurs fonds budgétaires (fonds
// partagés) — voir buildFondsRepartition. Pas de colonnes numérotées : fonds_budgetaire/
// prix_cad/devise_originale/prix_devise_originale (déjà dans COMMON_HEADERS) acceptent
// plusieurs valeurs séparées par ";" dans la même cellule ; pourcentage est la seule
// colonne réellement nouvelle. Réservée aux 3 formulaires qui supportent le partage
// (Nouvel achat unique, Nouvel abonnement, Modification et CCOL).
const FONDS_PARTAGES_HEADERS = ['pourcentage'];

const IMPORT_CONFIGS = {

  // ── Nouvel achat unique ──────────────────────────────────────────
  'Nouvel achat unique': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
      'date_publication', 'source_information'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, ...FONDS_PARTAGES_HEADERS,
      'id_ressource', 'projets_speciaux', 'format_pret_numerique',
      'type_monographie', 'format_electronique',
      'reserve_cours', 'reserve_cours_sigle', 'reserve_cours_session', 'reserve_cours_enseignant',
      'bordereau_imprime', 'quantite'
    ],
    buildSpecificData: (row) => ({
      id_ressource:             row['id_ressource']             || null,
      projets_speciaux:         row['projets_speciaux']         || null,
      type_monographie:         row['type_monographie']         || null,
      format_electronique:      row['format_electronique']      || null,
      reserve_cours:            parseBool(row['reserve_cours']),
      reserve_cours_sigle:      row['reserve_cours_sigle']      || null,
      reserve_cours_session:    row['reserve_cours_session']    || null,
      reserve_cours_enseignant: row['reserve_cours_enseignant'] || null,
      bordereau_imprime:        row['bordereau_imprime']        || null,
      quantite:                 row['quantite'] ? parseInt(row['quantite'], 10) : null,
    })
  },

  // ── Nouvel abonnement ────────────────────────────────────────────
  'Nouvel abonnement': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'categorie_document', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
      'source_information', 'date_debut_abonnement'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, ...FONDS_PARTAGES_HEADERS, 'projet_special',
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
      'editeur', 'categorie_document', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
      'source_information', 'precision_demande'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, ...FONDS_PARTAGES_HEADERS, 'projet_special',
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
      'editeur', 'categorie_document', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
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
  // categorie_document n'est plus un champ de ce formulaire (remplacé par type_monographie,
  // spécifique à Accessibilité — voir requete-accessibilite côté usager) : pas de colonne requise.
  'Requête ACQ Accessibilité': {
    requiredColumns: [...COMMON_REQUIRED,
      'editeur', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
      'source_information'
    ],
    templateHeaders: [
      'priorite_demande', ...COMMON_HEADERS, 'projet_special', 'format_pret_numerique',
      'reference_usager', 'besoin_specifique_format', 'type_monographie',
      'fournisseur_contacte_sans_succes', 'exemplaire_detenu', 'exemplaire_electronique_detenu',
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
      exemplaire_electronique_detenu:   row['exemplaire_electronique_detenu']    || null,
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
      'editeur', 'categorie_document', 'format_support',
      'devise_originale', 'prix_devise_originale', 'prix_cad', 'fonds_budgetaire',
      'source_information',
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
