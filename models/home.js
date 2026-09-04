const pool = require('../config/postgres.config');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPER — le tableau de bord se filtre par ANNÉE (calendaire) plutôt que par fenêtre
   glissante de jours : plus lisible pour des données d'acquisitions, qui se pensent par
   année budgétaire. `period` vaut soit une année ("2026"), soit "all" (aucun filtre).
   Validé strictement en entier avant interpolation — pas de saisie libre en SQL.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function parseYear(period) {
  if (!period || period === 'all') return null;
  const year = parseInt(period, 10);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

// Prédicat sur intervalle (>= début AND < début année suivante) plutôt que
// EXTRACT(YEAR FROM ...) = année : ce dernier n'est pas "sargable" — Postgres ne peut pas
// s'en servir d'un index B-tree standard sur la colonne date, et scanne la table entière
// même pour une seule année. L'intervalle, lui, permet un vrai index range scan.
function yearWhereClause(year, column = 'date_creation') {
  if (!year) return '';
  return `WHERE ${column} >= '${year}-01-01' AND ${column} < '${year + 1}-01-01'`;
}

const Logs = {

  /* ─────────────────────────────────────────────
     Statistiques globales filtrées par période
  ───────────────────────────────────────────── */
  fetchCountBoard: async (period = 'all') => {
    const year = parseYear(period);

    /*
      Stratégie :
      - Les totaux d'activité (byType, byPriority, topDemandeurs) portent sur l'ANNÉE
        sélectionnée (ou toutes années si "all")
      - items_last_7_days reste toujours sur les 7 derniers jours calendaires, indépendant
        de l'année sélectionnée (info contextuelle fixe — n'a pas de sens sur une année passée)
      - byStatutAcq/bySuiviAcq : état ACTUEL de tous les items, toujours toutes années (backlog,
        voir commentaire plus bas)
      - byMonth garde 6 mois pour l'historique, indépendant de l'année sélectionnée
    */
    const query = `
      WITH filtered AS (
        SELECT *
        FROM tbl_items
        ${yearWhereClause(year)}
      ),

      stats AS (
        SELECT
          COUNT(*)                                                                    AS total_items,
          COUNT(DISTINCT demandeur)                                                   AS unique_demandeurs,
          (SELECT COUNT(*) FROM tbl_items
            WHERE date_creation >= CURRENT_DATE - INTERVAL '7 days')                  AS items_last_7_days,
          -- Carte "Demandes traitées" (accueil admin) : toutes années, comme
          -- items_last_7_days ci-dessus — un item réellement traité par les ACQ (suivi_acq/
          -- statut_acq au-delà des valeurs par défaut du formulaire de décision, voir
          -- estAcqEnAttenteDefaut côté frontend). Complément de "Demandes en attente".
          (SELECT COUNT(*)::int FROM tbl_items
            WHERE statut_bibliotheque = 'Soumettre aux ACQ'
              AND NOT (suivi_acq  IS NULL OR suivi_acq  = '' OR suivi_acq  = 'En attente de traitement')
              AND NOT (statut_acq IS NULL OR statut_acq = '' OR statut_acq = 'En attente'))          AS total_traitees,
          -- Carte "Demandes urgentes" : priorité Urgent ET encore en attente ACQ (mêmes
          -- valeurs par défaut/vides que "Demandes en attente" — voir ReponsesModel.getPending)
          -- — un urgent déjà traité n'a plus rien d'urgent à l'écran, pas utile à afficher ici.
          (SELECT COUNT(*)::int FROM tbl_items
            WHERE statut_bibliotheque = 'Soumettre aux ACQ'
              AND priorite_demande = 'Urgent'
              AND (suivi_acq  IS NULL OR suivi_acq  = '' OR suivi_acq  = 'En attente de traitement')
              AND (statut_acq IS NULL OR statut_acq = '' OR statut_acq = 'En attente'))              AS total_urgentes_attente,
          COUNT(*) FILTER (WHERE statut_acq = 'En traitement')              AS en_traitement,
          COUNT(*) FILTER (WHERE statut_acq = 'Complété')                    AS termines,
          COUNT(*) FILTER (WHERE statut_acq = 'En attente')                 AS en_attente
        FROM filtered
      ),

      by_type AS (
        SELECT
          formulaire_type,
          COUNT(*)                                                                          AS count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM filtered), 0), 1)         AS percentage
        FROM filtered
        WHERE formulaire_type IS NOT NULL
        GROUP BY formulaire_type
        ORDER BY count DESC
        LIMIT 7
      ),

      by_month AS (
        SELECT
          TO_CHAR(date_creation, 'YYYY-MM') AS month,
          COUNT(*)                           AS count
        FROM tbl_items
        WHERE date_creation >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(date_creation, 'YYYY-MM')
        ORDER BY month
      ),

      -- Toutes années, comme by_statut_acq/by_suivi_acq plus bas : alimente le badge
      -- secondaire "X prioritaires" de la carte "Demandes urgentes" (accueil.component.ts,
      -- prioritaireCount) — un backlog par priorité ne doit pas se vider juste parce qu'on
      -- filtre le tableau de bord sur une année.
      by_priority AS (
        SELECT
          COALESCE(priorite_demande, 'Non spécifiée') AS priorite,
          COUNT(*)                                     AS count,
          CASE
            WHEN priorite_demande = 'Haute'   THEN 1
            WHEN priorite_demande = 'Moyenne' THEN 2
            WHEN priorite_demande = 'Basse'   THEN 3
            ELSE 4
          END AS order_priority
        FROM tbl_items
        GROUP BY priorite_demande
        ORDER BY order_priority
      ),

      -- Répartition Statut ACQ / Suivi ACQ : état ACTUEL de tous les items, pas limité à la
      -- période sélectionnée (contrairement à by_priority/by_type ci-dessus, basés sur la
      -- CTE filtered) — un backlog ACQ ne doit pas se vider juste parce qu'on regarde "7
      -- derniers jours". Même univers que le total tout-items de la carte "Total demandes".
      by_statut_acq AS (
        SELECT
          COALESCE(NULLIF(statut_acq, ''), 'Non défini') AS statut,
          COUNT(*)                                        AS count
        FROM tbl_items
        GROUP BY COALESCE(NULLIF(statut_acq, ''), 'Non défini')
        ORDER BY count DESC
      ),

      by_suivi_acq AS (
        SELECT
          COALESCE(NULLIF(suivi_acq, ''), 'Non défini') AS suivi,
          COUNT(*)                                       AS count
        FROM tbl_items
        GROUP BY COALESCE(NULLIF(suivi_acq, ''), 'Non défini')
        ORDER BY count DESC
      ),

      top_demandeurs AS (
        SELECT
          demandeur,
          COUNT(*)                                    AS count,
          ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)  AS rank
        FROM filtered
        WHERE demandeur IS NOT NULL AND demandeur <> ''
        GROUP BY demandeur
        ORDER BY count DESC
        LIMIT 10
      )

      SELECT json_build_object(
        'totals',        (SELECT row_to_json(stats)                    FROM stats),
        'byType',        (SELECT json_agg(row_to_json(by_type))        FROM by_type),
        'byMonth',       (SELECT json_agg(row_to_json(by_month))       FROM by_month),
        'byPriority',    (SELECT json_agg(row_to_json(by_priority))    FROM by_priority),
        'byStatutAcq',   (SELECT json_agg(row_to_json(by_statut_acq))  FROM by_statut_acq),
        'bySuiviAcq',    (SELECT json_agg(row_to_json(by_suivi_acq))   FROM by_suivi_acq),
        'topDemandeurs', (SELECT json_agg(row_to_json(top_demandeurs)) FROM top_demandeurs),
        'period',        '${year ?? 'all'}'
      ) AS dashboard_data;
    `;

    try {
      const { rows } = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('❌ Erreur fetchCountBoard:', error);
      throw error;
    }
  },

  /* ─────────────────────────────────────────────
     Données graphiques filtrées par période
     dailyStats/statusEvolution ont été retirés : calculés puis jamais consommés par le
     frontend (accueil.component.ts n'utilise que libraryStats — vérifié, aucune autre page
     n'appelle /home/graph) — deux scans complets de tbl_items pour rien à chaque chargement
     du tableau de bord. À réintroduire si un futur écran en a besoin.
  ───────────────────────────────────────────── */
  getGraphiqueDonnees: async (period = 'all') => {
    const year           = parseYear(period);
    const creationFilter = yearWhereClause(year, 'date_creation');

    const query = `
      WITH library_stats AS (
        SELECT
          COALESCE(bibliotheque, 'Non spécifiée')                                         AS bibliotheque,
          COUNT(*)                                                                          AS total,
          ROUND(COUNT(*) * 100.0 / NULLIF((
            SELECT COUNT(*) FROM tbl_items
            ${creationFilter}
          ), 0), 1)                                                                        AS percentage
        FROM tbl_items
        ${creationFilter}
        GROUP BY bibliotheque
        ORDER BY total DESC
        LIMIT 8
      )

      SELECT json_build_object(
        'libraryStats', (SELECT json_agg(row_to_json(library_stats)) FROM library_stats)
      ) AS graph_data;
    `;

    try {
      const { rows } = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('❌ Erreur getGraphiqueDonnees:', error);
      throw error;
    }
  }
};

module.exports = Logs;