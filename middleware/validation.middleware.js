require('dotenv').config();
const rateLimit = require('express-rate-limit');

// Middleware de limitation de débit (rate limiting)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limite chaque IP à 100 requêtes par fenêtre
  message: {
    error: 'Trop de requêtes effectuées depuis cette IP',
    message: 'Veuillez réessayer dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de validation des données
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Données invalides',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Middleware de gestion globale des erreurs
const errorHandler = (err, req, res, next) => {
  console.error('Erreur:', err);

  // Erreur de validation Joi
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Erreur de validation',
      details: err.details.map(detail => detail.message)
    });
  }

  // Erreur de limitation de débit
  if (err.statusCode === 429) {
    return res.status(429).json({
      error: 'Trop de requêtes',
      message: 'Veuillez ralentir vos requêtes.'
    });
  }

  // Erreur générale du serveur
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erreur interne du serveur' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Middleware de validation des paramètres d'URL
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Paramètres invalides',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Middleware de validation des query strings
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Paramètres de requête invalides',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports = {
  apiLimiter,
  errorHandler,
  validateRequest,
  validateParams,
  validateQuery
};