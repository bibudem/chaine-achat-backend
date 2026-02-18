// models/rapports.js - VERSION FLEXIBLE
const pool = require('../config/postgres.config');

/**
 * Configuration des colonnes de la base de données
 * 
 * ⚠️ IMPORTANT: Basé sur votre CSV, la clé primaire semble être "item_id", pas "id"
 * Si vous avez une erreur "colonne id n'existe pas", c'est normal.
 * 
 * Adaptez ces noms aux VRAIES colonnes de votre table.
 * Pour les découvrir, exécutez le script SQL fourni: decouvrir_colonnes.sql
 */
const COL = {
  table: 'tbl_items',

  // ⚠️ MODIFIER ICI: Utilisez le vrai nom de votre clé primaire
  // Option 1: Si c'est "item_id"
  id: 'item_id',
  // Option 2: Si c'est "id"  
  // id: 'id',
  
  // Colonnes principales
  formulaireType: 'formulaire_type',
  dateCreation: 'date_creation',
  dateModification: 'date_modification',
  priorite: 'priorite_demande',
  
  // Informations document
  titre: 'titre_document',
  sousTitre: 'sous_titre',
  identifiant: 'isbn_issn',
  editeur: 'editeur',
  annee: 'date_publication',
  
  // Classification
  typeDocument: 'categorie_document',
  support: 'format_support',
  fonds: 'fonds_budgetaire',
  
  // Acteurs
  bibliotheque: 'bibliotheque',
  demandeur: 'demandeur',
  
  // Statuts
  statutBibliotheque: 'statut_bibliotheque',
  statutAcq: 'statut_acq'
};

// Libellés de statuts standards
const STATUTS = {
  BIB_EN_ATTENTE: ['En attente en bibliothèque', 'En attente'],
  BIB_EN_TRAITEMENT: ['En traitement', 'En traitement en bibliothèque'],
  BIB_TERMINE: ['Terminé'],
  ACQ_SOUMIS: ['Soumis aux ACQ'],
  ACQ_ANNULEE: ['Demande annulée']
};

/**
 * Valide une chaîne de date
 */
function isValidDateString(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

/**
 * Normalise et valide la pagination
 */
function normalizePagination(limit, offset) {
  const l = Math.min(Math.max(parseInt(limit ?? 100, 10) || 100, 1), 500);
  const o = Math.max(parseInt(offset ?? 0, 10) || 0, 0);
  return { limit: l, offset: o };
}

/**
 * Construit une clause WHERE pour les dates (inclut la journée complète)
 */
function buildDateClause(dateDebut, dateFin, params, idxStart = 1) {
  let idx = idxStart;
  
  if (dateDebut && dateFin) {
    if (!isValidDateString(dateDebut) || !isValidDateString(dateFin)) {
      throw new Error('Paramètres de date invalides (dateDebut/dateFin).');
    }
    
    // Clause qui inclut toute la journée de fin
    const clause =
      `${COL.dateCreation} >= $${idx}::timestamptz ` +
      `AND ${COL.dateCreation} < ($${idx + 1}::timestamptz + interval '1 day')`;
    
    params.push(dateDebut, dateFin);
    return { clause, idx: idx + 2 };
  }
  
  return { clause: '', idx };
}

/**
 * Whitelist des filtres autorisés
 * Empêche l'injection SQL par nom de colonne
 */
const ALLOWED_FILTERS = {
  id: COL.item_id,
  formulaire_type: COL.formulaire_type,
  priorite: COL.priorite,
  bibliotheque: COL.bibliotheque,
  demandeur: COL.demandeur,
  typeDocument: COL.typeDocument,
  support: COL.support,
  fonds: COL.fonds,
  editeur: COL.editeur,
  annee: COL.annee,
  statutBibliotheque: COL.statutBibliotheque,
  statutAcq: COL.statutAcq
};

// ==================== STATISTIQUES GÉNÉRALES ====================
async function statistiquesGenerales({ dateDebut, dateFin }) {
  console.log('📊 Model: statistiquesGenerales', { dateDebut, dateFin });
  
  const params = [];
  let idx = 1;
  const whereParts = [];

  const { clause, idx: idxAfterDate } = buildDateClause(dateDebut, dateFin, params, idx);
  idx = idxAfterDate;
  if (clause) whereParts.push(clause);

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const query = `
    SELECT
      COUNT(*)::int AS total_items,
      COUNT(DISTINCT ${COL.demandeur})::int AS total_demandeurs,

      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx}))::int AS bib_en_attente,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 1}))::int AS bib_en_traitement,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 2}))::int AS bib_termines,

      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 3}))::int AS acq_soumis,
      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 4}))::int AS acq_annulees
    FROM ${COL.table}
    ${where}
  `;

  params.push(
    STATUTS.BIB_EN_ATTENTE,
    STATUTS.BIB_EN_TRAITEMENT,
    STATUTS.BIB_TERMINE,
    STATUTS.ACQ_SOUMIS,
    STATUTS.ACQ_ANNULEE
  );

  console.log('🔍 Query:', query.substring(0, 200) + '...');
  console.log('📋 Params:', params);

  const { rows } = await pool.query(query, params);
  return rows[0];
}

// ==================== RAPPORT PAR TYPE ====================
async function rapportParType({ dateDebut, dateFin, formulaireType }) {
  console.log('📊 Model: rapportParType', { dateDebut, dateFin, formulaireType });
  
  const params = [];
  let idx = 1;
  const whereParts = ['1=1'];

  const { clause, idx: idxAfterDate } = buildDateClause(dateDebut, dateFin, params, idx);
  idx = idxAfterDate;
  if (clause) whereParts.push(clause);

  if (formulaireType) {
    whereParts.push(`${COL.formulaireType} = $${idx}`);
    params.push(formulaireType);
    idx += 1;
  }

  const where = `WHERE ${whereParts.join(' AND ')}`;

  const query = `
    SELECT
      ${COL.formulaireType} AS formulaire_type,
      COUNT(*)::int AS total,

      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx}))::int AS bib_en_attente,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 1}))::int AS bib_en_traitement,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 2}))::int AS bib_termines,

      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 3}))::int AS acq_soumis,
      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 4}))::int AS acq_annulees

    FROM ${COL.table}
    ${where}
    GROUP BY ${COL.formulaireType}
    ORDER BY total DESC
  `;

  params.push(
    STATUTS.BIB_EN_ATTENTE,
    STATUTS.BIB_EN_TRAITEMENT,
    STATUTS.BIB_TERMINE,
    STATUTS.ACQ_SOUMIS,
    STATUTS.ACQ_ANNULEE
  );

  console.log('🔍 Query:', query.substring(0, 200) + '...');

  const { rows } = await pool.query(query, params);
  return rows;
}

// ==================== RAPPORT DÉTAILLÉ ====================
async function rapportDetaille(filters = {}, limit = 100, offset = 0) {
  console.log('📊 Model: rapportDetaille');
  console.log('🔍 Filtres reçus:', filters);
  console.log('📄 Pagination:', { limit, offset });
  
  const params = [];
  let idx = 1;
  const conditions = [];

  // 1. Filtre de dates
  if (filters.dateDebut && filters.dateFin) {
    const { clause, idx: idxAfterDate } = buildDateClause(
      filters.dateDebut,
      filters.dateFin,
      params,
      idx
    );
    if (clause) {
      conditions.push(clause);
      console.log('✅ Filtre date ajouté');
    }
    idx = idxAfterDate;
  }

  // 2. Autres filtres (whitelist)
  for (const [apiKey, dbCol] of Object.entries(ALLOWED_FILTERS)) {
    const value = filters[apiKey];
    
    // Ignorer les valeurs vides
    if (value === undefined || value === null || value === '') continue;

    // Recherche partielle pour le demandeur (ILIKE)
    if (apiKey === 'demandeur' && typeof value === 'string') {
      conditions.push(`${dbCol} ILIKE $${idx}`);
      params.push(`%${value}%`);
      console.log(`✅ Filtre ${apiKey} (ILIKE) ajouté`);
      idx += 1;
      continue;
    }

    // Recherche exacte pour les autres champs
    conditions.push(`${dbCol} = $${idx}`);
    params.push(value);
    console.log(`✅ Filtre ${apiKey} (=) ajouté:`, value);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { limit: l, offset: o } = normalizePagination(limit, offset);

  // ✅ Query optimisée - retourne TOUTES les colonnes
  const query = `
    SELECT *
    FROM ${COL.table}
    ${where}
    ORDER BY ${COL.dateCreation} DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  // Query de comptage
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ${COL.table}
    ${where}
  `;

  console.log('🔍 Query données:', query);
  console.log('🔍 Query count:', countQuery);
  console.log('📋 Params:', params);

  try {
    // Exécuter les deux requêtes en parallèle
    const [data, count] = await Promise.all([
      pool.query(query, [...params, l, o]),
      pool.query(countQuery, params)
    ]);

    const result = {
      data: data.rows,
      total: count.rows[0]?.total ?? 0,
      limit: l,
      offset: o
    };

    console.log('✅ Résultat:', {
      lignes: result.data.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });
    
    // Log de diagnostic: affiche la structure de la première ligne
    if (result.data.length > 0) {
      console.log('📊 Structure première ligne:', Object.keys(result.data[0]).sort());
      console.log('📊 Premier élément (partiel):', {
        id: result.data[0][COL.id],
        titre: result.data[0]['titre_document'] || result.data[0][COL.titre],
        formulaire_type: result.data[0][COL.formulaireType]
      });
    }

    return result;
    
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    console.error('📋 Params utilisés:', params);
    throw error;
  }
}

module.exports = {
  COL,
  STATUTS,
  statistiquesGenerales,
  rapportParType,
  rapportDetaille
};