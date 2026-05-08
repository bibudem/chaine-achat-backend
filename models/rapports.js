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

// Whitelist des filtres — clé = nom reçu dans req.query, valeur = colonne SQL (alias i.)
const ALLOWED_FILTERS = {
  id:                 'i.item_id',
  formulaire_type:    'i.formulaire_type',
  priorite:           'i.priorite_demande',
  bibliotheque:       'i.bibliotheque',
  demandeur:          'i.demandeur',
  typeDocument:       'i.categorie_document',
  support:            'i.format_support',
  fonds:              'i.fonds_budgetaire',
  editeur:            'i.editeur',
  annee:              'i.date_publication',
  statutBibliotheque: 'i.statut_bibliotheque',
  statutAcq:          'i.statut_acq'
};

// ─── Utilitaires ─────────────────────────────────────────

function isValidDateString(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

function normalizePagination(limit, offset) {
  const l = Math.min(Math.max(parseInt(limit ?? 500, 10) || 500, 1), 5000);
  const o = Math.max(parseInt(offset ?? 0, 10) || 0, 0);
  return { limit: l, offset: o };
}

function buildDateClause(dateDebut, dateFin, params, idxStart = 1) {
  if (dateDebut && dateFin) {
    if (!isValidDateString(dateDebut) || !isValidDateString(dateFin)) {
      throw new Error('Paramètres de date invalides (dateDebut/dateFin).');
    }
    const clause =
      `i.${COL.dateCreation} >= $${idxStart}::timestamptz ` +
      `AND i.${COL.dateCreation} < ($${idxStart + 1}::timestamptz + interval '1 day')`;
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

  // For stats, we query tbl_items directly (no JOINs needed)
  const statsWhere = whereParts.length
    ? whereParts[0].replace(/i\./g, '')   // strip i. alias for simple query
    : '';
  const where = statsWhere ? `WHERE ${statsWhere}` : '';

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
// JOIN sur toutes les tables spécifiques pour inclure les champs propres
// à chaque type de formulaire dans le résultat.

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

    // Valeurs multiples (virgule-séparées) → = ANY(ARRAY[...])
    if (typeof value === 'string' && value.includes(',')) {
      const values = value.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length > 0) {
        conditions.push(`${dbCol} = ANY($${idx})`);
        params.push(values);
        idx += 1;
      }
      continue;
    }

    // Égalité exacte
    conditions.push(`${dbCol} = $${idx}`);
    params.push(value);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { limit: l, offset: o } = normalizePagination(limit, offset);

  // Requête principale : JOIN sur toutes les tables spécifiques
  const dataQuery = `
    SELECT
      i.*,

      -- Modification et CCOL
      mc.precision_demande,
      mc.numero_oclc,

      -- Partagé : date_debut_abonnement (CCOL + Nouvel abonnement)
      COALESCE(mc.date_debut_abonnement, na.date_debut_abonnement)         AS date_debut_abonnement,
      -- Partagé : usager_aviser_activation (CCOL + Nouvel achat unique)
      COALESCE(mc.usager_aviser_activation, nau.usager_aviser_activation)  AS usager_aviser_activation,
      -- Partagé : usager_aviser_reservation (Nouvel abonnement + Nouvel achat unique)
      COALESCE(na.usager_aviser_reservation, nau.usager_aviser_reservation) AS usager_aviser_reservation,
      -- Partagé : type_monographie (Nouvel abonnement + Nouvel achat unique + Requête ACQ)
      COALESCE(na.type_monographie, nau.type_monographie, racq.type_monographie) AS type_monographie,

      -- Nouvel achat unique
      nau.id_ressource,
      nau.projets_speciaux,
      nau.format_electronique,
      nau.quantite,
      nau.reserve_cours_session,
      nau.reserve_cours_enseignant,

      -- Partagé : reserve_cours (Nouvel achat unique + Suggestion d'achat)
      COALESCE(nau.reserve_cours, sa.reserve_cours)                        AS reserve_cours,
      -- Partagé : reserve_cours_sigle
      COALESCE(nau.reserve_cours_sigle, sa.reserve_cours_sigle)            AS reserve_cours_sigle,
      -- Partagé : bordereau_imprime
      COALESCE(nau.bordereau_imprime, sa.bordereau_imprime)                AS bordereau_imprime,
      -- Partagé : acq_responsable_courriel (PEB + Requête ACQ + Suggestion d'achat)
      COALESCE(ptn.acq_responsable_courriel, racq.acq_responsable_courriel, sa.acq_responsable_courriel) AS acq_responsable_courriel,

      -- PEB Tipasa numérique
      ptn.reference_tipasa,
      ptn.gobi_vu_format_numerique,
      ptn.gobi_version_moins_365_usd,

      -- Requête ACQ Accessibilité
      racq.reference_usager,
      racq.besoin_specifique_format,
      racq.permalien_sofia,
      racq.fournisseur_contacte_sans_succes,
      racq.exemplaire_detenu,
      racq.verification_caeb,
      racq.verification_sqla,
      racq.verification_emma,
      racq.acq_numerisation_recommandee,
      racq.acq_date_demande_editeur,
      racq.acq_date_livraison_estimee,

      -- Suggestion d'achat — Usager
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
      sa.acq_isbn

    FROM tbl_items i
    LEFT JOIN tbl_modification_ccol       mc   ON mc.item_id   = i.item_id
    LEFT JOIN tbl_nouvel_abonnement       na   ON na.item_id   = i.item_id
    LEFT JOIN tbl_nouvel_achat_unique     nau  ON nau.item_id  = i.item_id
    LEFT JOIN tbl_peb_tipasa_numerique    ptn  ON ptn.item_id  = i.item_id
    LEFT JOIN tbl_requete_acq             racq ON racq.item_id = i.item_id
    LEFT JOIN tbl_suggestion_achat        sa   ON sa.item_id   = i.item_id
    ${where}
    ORDER BY i.${COL.dateCreation} DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  // Compte : requête simple sur tbl_items i (les filtres utilisent i. comme alias)
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM tbl_items i
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
