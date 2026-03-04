// models/rapports.js
const pool = require('../config/postgres.config');

const COL = {
  table:              'tbl_items',
  id:                 'item_id',
  formulaireType:     'formulaire_type',
  dateCreation:       'date_creation',
  dateModification:   'date_modification',
  priorite:           'priorite_demande',
  titre:              'titre_document',
  sousTitre:          'sous_titre',
  identifiant:        'isbn_issn',
  editeur:            'editeur',
  annee:              'date_publication',
  typeDocument:       'categorie_document',
  support:            'format_support',
  fonds:              'fonds_budgetaire',
  bibliotheque:       'bibliotheque',
  demandeur:          'demandeur',
  statutBibliotheque: 'statut_bibliotheque',
  statutAcq:          'statut_acq'
};

const STATUTS = {
  BIB_EN_ATTENTE:    ['En attente en bibliothèque', 'En attente'],
  BIB_EN_TRAITEMENT: ['En traitement', 'En traitement en bibliothèque'],
  BIB_TERMINE:       ['Terminé'],
  ACQ_SOUMIS:        ['Soumis aux ACQ'],
  ACQ_ANNULEE:       ['Demande annulée']
};

// Whitelist des filtres acceptés par rapportDetaille
// clé = nom reçu dans req.query, valeur = colonne SQL
const ALLOWED_FILTERS = {
  id:                 COL.id,
  formulaire_type:    COL.formulaireType,
  priorite:           COL.priorite,
  bibliotheque:       COL.bibliotheque,
  demandeur:          COL.demandeur,
  typeDocument:       COL.typeDocument,
  support:            COL.support,
  fonds:              COL.fonds,
  editeur:            COL.editeur,
  annee:              COL.annee,
  statutBibliotheque: COL.statutBibliotheque,
  statutAcq:          COL.statutAcq
};

// ─── Utilitaires ─────────────────────────────────────────

function isValidDateString(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

function normalizePagination(limit, offset) {
  const l = Math.min(Math.max(parseInt(limit ?? 100, 10) || 100, 1), 500);
  const o = Math.max(parseInt(offset ?? 0, 10) || 0, 0);
  return { limit: l, offset: o };
}

function buildDateClause(dateDebut, dateFin, params, idxStart = 1) {
  if (dateDebut && dateFin) {
    if (!isValidDateString(dateDebut) || !isValidDateString(dateFin)) {
      throw new Error('Paramètres de date invalides (dateDebut/dateFin).');
    }
    const clause =
      `${COL.dateCreation} >= $${idxStart}::timestamptz ` +
      `AND ${COL.dateCreation} < ($${idxStart + 1}::timestamptz + interval '1 day')`;
    params.push(dateDebut, dateFin);
    return { clause, idx: idxStart + 2 };
  }
  return { clause: '', idx: idxStart };
}

// ─── Statistiques générales ──────────────────────────────

async function statistiquesGenerales({ dateDebut, dateFin }) {
  const params = [];
  const whereParts = [];

  const { clause, idx } = buildDateClause(dateDebut, dateFin, params, 1);
  if (clause) whereParts.push(clause);

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const query = `
    SELECT
      COUNT(*)::int                                                               AS total_items,
      COUNT(DISTINCT ${COL.demandeur})::int                                       AS total_demandeurs,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx}))::int      AS bib_en_attente,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 1}))::int  AS bib_en_traitement,
      COUNT(*) FILTER (WHERE ${COL.statutBibliotheque} = ANY($${idx + 2}))::int  AS bib_termines,
      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 3}))::int           AS acq_soumis,
      COUNT(*) FILTER (WHERE ${COL.statutAcq} = ANY($${idx + 4}))::int           AS acq_annulees
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

  const { rows } = await pool.query(query, params);
  return rows[0];
}

// ─── Rapport détaillé ────────────────────────────────────
// Retourne toutes les lignes brutes.
// Les regroupements (par type, bibliothèque, etc.) sont
// calculés côté Angular — pas besoin d'autres endpoints.

async function rapportDetaille(filters = {}, limit = 100, offset = 0) {
  const params = [];
  let idx = 1;
  const conditions = [];

  // 1. Filtre de dates
  if (filters.dateDebut && filters.dateFin) {
    const { clause, idx: idxAfterDate } = buildDateClause(
      filters.dateDebut, filters.dateFin, params, idx
    );
    if (clause) conditions.push(clause);
    idx = idxAfterDate;
  }

  // 2. Autres filtres (whitelist — évite l'injection SQL)
  for (const [apiKey, dbCol] of Object.entries(ALLOWED_FILTERS)) {
    const value = filters[apiKey];
    if (value === undefined || value === null || value === '') continue;

    // Recherche partielle ILIKE pour le demandeur
    if (apiKey === 'demandeur' && typeof value === 'string') {
      conditions.push(`${dbCol} ILIKE $${idx}`);
      params.push(`%${value}%`);
      idx += 1;
      continue;
    }

    // Égalité exacte pour tous les autres champs
    conditions.push(`${dbCol} = $${idx}`);
    params.push(value);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { limit: l, offset: o } = normalizePagination(limit, offset);

  const dataQuery = `
    SELECT *
    FROM ${COL.table}
    ${where}
    ORDER BY ${COL.dateCreation} DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ${COL.table}
    ${where}
  `;

  const [data, count] = await Promise.all([
    pool.query(dataQuery, [...params, l, o]),
    pool.query(countQuery, params)
  ]);

  return {
    data:   data.rows,
    total:  count.rows[0]?.total ?? 0,
    limit:  l,
    offset: o
  };
}

// ─── Exports ─────────────────────────────────────────────

module.exports = {
  COL,
  STATUTS,
  statistiquesGenerales,
  rapportDetaille
};