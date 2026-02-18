const Logs = require('../models/home');

exports.getCount = async (req, res, next) => {
  try {
    const [result] = await Logs.fetchCountBoard();
    const dashboardData = result.dashboard_data;
    
    res.status(200).json({
      success: true,
      message: 'Données dashboard récupérées avec succès',
      data: dashboardData,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur getCount:', err);
    
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};

exports.getGraphiqueDonnees = async (req, res, next) => {
  try {
    const [result] = await Logs.getGraphiqueDonnees();
    const graphData = result.graph_data;
    
    res.status(200).json({
      success: true,
      message: 'Données graphiques récupérées avec succès',
      data: graphData,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Erreur getGraphiqueDonnees:', err);
    
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Erreur serveur',
      timestamp: new Date().toISOString()
    });
  }
};