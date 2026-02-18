const pool = require('../config/postgres.config');

const Logs = {
  fetchCountBoard: async () => {
    try {
      const query = `
        WITH stats AS (
          -- Total des items
          SELECT 
            COUNT(*) as total_items,
            COUNT(DISTINCT demandeur) as unique_demandeurs,
            COUNT(CASE WHEN date_creation >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as items_last_7_days,
            COUNT(CASE WHEN statut_bibliotheque = 'En traitement' THEN 1 END) as en_traitement,
            COUNT(CASE WHEN statut_bibliotheque = 'Terminé' THEN 1 END) as termines,
            COUNT(CASE WHEN statut_bibliotheque = 'En attente' THEN 1 END) as en_attente
          FROM tbl_items
        ),
        by_type AS (
          -- Par type de formulaire
          SELECT 
            formulaire_type,
            COUNT(*) as count,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tbl_items), 1) as percentage
          FROM tbl_items
          WHERE formulaire_type IS NOT NULL
          GROUP BY formulaire_type
          ORDER BY count DESC
          LIMIT 5
        ),
        by_month AS (
          -- Évolution mensuelle
          SELECT 
            TO_CHAR(date_creation, 'YYYY-MM') as month,
            COUNT(*) as count
          FROM tbl_items
          WHERE date_creation >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY TO_CHAR(date_creation, 'YYYY-MM')
          ORDER BY month
        ),
        by_priority AS (
          -- Par priorité
          SELECT 
            COALESCE(priorite_demande, 'Non spécifiée') as priorite,
            COUNT(*) as count,
            CASE 
              WHEN priorite_demande = 'Haute' THEN 1
              WHEN priorite_demande = 'Moyenne' THEN 2
              WHEN priorite_demande = 'Basse' THEN 3
              ELSE 4
            END as order_priority
          FROM tbl_items
          GROUP BY priorite_demande
          ORDER BY order_priority
        ),
        top_demandeurs AS (
          -- Top demandeurs
          SELECT 
            demandeur,
            COUNT(*) as count,
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank
          FROM tbl_items
          WHERE demandeur IS NOT NULL AND demandeur != ''
          GROUP BY demandeur
          ORDER BY count DESC
          LIMIT 10
        )
        
        SELECT 
          json_build_object(
            'totals', (SELECT row_to_json(stats) FROM stats),
            'byType', (SELECT json_agg(row_to_json(by_type)) FROM by_type),
            'byMonth', (SELECT json_agg(row_to_json(by_month)) FROM by_month),
            'byPriority', (SELECT json_agg(row_to_json(by_priority)) FROM by_priority),
            'topDemandeurs', (SELECT json_agg(row_to_json(top_demandeurs)) FROM top_demandeurs)
          ) as dashboard_data;
      `;
      
      const result = await pool.query(query);
      return result.rows;
      
    } catch (error) {
      console.error('❌ Erreur dans fetchCountBoard:', error);
      throw error;
    }
  },

  getGraphiqueDonnees: async () => {
    try {
      const query = `
        WITH daily_stats AS (
          SELECT 
            DATE(date_creation) as date,
            COUNT(*) as count,
            COUNT(CASE WHEN statut_bibliotheque = 'Terminé' THEN 1 END) as completed,
            COUNT(CASE WHEN formulaire_type = 'Nouvel achat unique' THEN 1 END) as achats_uniques,
            COUNT(CASE WHEN formulaire_type = 'Nouvel abonnement' THEN 1 END) as abonnements
          FROM tbl_items
          WHERE date_creation >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(date_creation)
          ORDER BY date
        ),
        library_stats AS (
          SELECT 
            COALESCE(bibliotheque, 'Non spécifiée') as bibliotheque,
            COUNT(*) as total,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tbl_items), 1) as percentage
          FROM tbl_items
          GROUP BY bibliotheque
          ORDER BY total DESC
          LIMIT 8
        ),
        status_evolution AS (
          SELECT 
            DATE(date_modification) as date,
            statut_bibliotheque,
            COUNT(*) as count
          FROM tbl_items
          WHERE date_modification >= CURRENT_DATE - INTERVAL '30 days'
            AND statut_bibliotheque IS NOT NULL
          GROUP BY DATE(date_modification), statut_bibliotheque
          ORDER BY date, statut_bibliotheque
        )
        
        SELECT 
          json_build_object(
            'dailyStats', (SELECT json_agg(row_to_json(daily_stats)) FROM daily_stats),
            'libraryStats', (SELECT json_agg(row_to_json(library_stats)) FROM library_stats),
            'statusEvolution', (SELECT json_agg(row_to_json(status_evolution)) FROM status_evolution)
          ) as graph_data;
      `;
      
      const result = await pool.query(query);
      return result.rows;
      
    } catch (error) {
      console.error('❌ Erreur dans getGraphiqueDonnees:', error);
      throw error;
    }
  }
};

module.exports = Logs;