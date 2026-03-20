const pool = require('../config/postgres.config');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPER — convertit le paramètre période en
   intervalle PostgreSQL valide et en jours (entier)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function parsePeriod(period) {
  switch (period) {
    case '30days': return { interval: '30 days', days: 30 };
    case '90days': return { interval: '90 days', days: 90 };
    case '7days':
    default:       return { interval: '7 days',  days: 7  };
  }
}

const Logs = {

  /* ─────────────────────────────────────────────
     Statistiques globales filtrées par période
  ───────────────────────────────────────────── */
  fetchCountBoard: async (period = '7days') => {
    const { interval, days } = parsePeriod(period);

    /*
      Stratégie :
      - Les totaux (statuts) portent sur la PÉRIODE sélectionnée
      - items_last_7_days reste toujours sur 7j (info contextuelle fixe)
      - byType, byPriority, topDemandeurs filtrent aussi sur la période
      - byMonth garde 6 mois pour l'historique
    */
    const query = `
      WITH filtered AS (
        SELECT *
        FROM tbl_items
        WHERE date_creation >= CURRENT_DATE - INTERVAL '${interval}'
      ),

      stats AS (
        SELECT
          COUNT(*)                                                                    AS total_items,
          COUNT(DISTINCT demandeur)                                                   AS unique_demandeurs,
          COUNT(*) FILTER (WHERE date_creation >= CURRENT_DATE - INTERVAL '7 days')  AS items_last_7_days,
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
        FROM filtered
        GROUP BY priorite_demande
        ORDER BY order_priority
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
        'topDemandeurs', (SELECT json_agg(row_to_json(top_demandeurs)) FROM top_demandeurs),
        'period',        '${period}',
        'periodDays',    ${days}
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
  ───────────────────────────────────────────── */
  getGraphiqueDonnees: async (period = '7days') => {
    const { interval } = parsePeriod(period);

    const query = `
      WITH daily_stats AS (
        SELECT
          DATE(date_creation)                                                              AS date,
          COUNT(*)                                                                          AS count,
          COUNT(*) FILTER (WHERE statut_bibliotheque = 'Terminé')                         AS completed,
          COUNT(*) FILTER (WHERE formulaire_type = 'Nouvel achat unique')                 AS achats_uniques,
          COUNT(*) FILTER (WHERE formulaire_type = 'Nouvel abonnement')                   AS abonnements
        FROM tbl_items
        WHERE date_creation >= CURRENT_DATE - INTERVAL '${interval}'
        GROUP BY DATE(date_creation)
        ORDER BY date
      ),

      library_stats AS (
        SELECT
          COALESCE(bibliotheque, 'Non spécifiée')                                         AS bibliotheque,
          COUNT(*)                                                                          AS total,
          ROUND(COUNT(*) * 100.0 / NULLIF((
            SELECT COUNT(*) FROM tbl_items
            WHERE date_creation >= CURRENT_DATE - INTERVAL '${interval}'
          ), 0), 1)                                                                        AS percentage
        FROM tbl_items
        WHERE date_creation >= CURRENT_DATE - INTERVAL '${interval}'
        GROUP BY bibliotheque
        ORDER BY total DESC
        LIMIT 8
      ),

      status_evolution AS (
        SELECT
          DATE(date_modification) AS date,
          statut_bibliotheque,
          COUNT(*)                AS count
        FROM tbl_items
        WHERE date_modification >= CURRENT_DATE - INTERVAL '${interval}'
          AND statut_bibliotheque IS NOT NULL
        GROUP BY DATE(date_modification), statut_bibliotheque
        ORDER BY date, statut_bibliotheque
      )

      SELECT json_build_object(
        'dailyStats',      (SELECT json_agg(row_to_json(daily_stats))      FROM daily_stats),
        'libraryStats',    (SELECT json_agg(row_to_json(library_stats))    FROM library_stats),
        'statusEvolution', (SELECT json_agg(row_to_json(status_evolution)) FROM status_evolution)
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