// Gabarit — copier en config.dev.js et/ou config.prod.js (gitignorés) et remplir les valeurs réelles
// clientSecret, JWT_SECRET et N8N_BASE_URL ne vont PAS ici : ce sont des secrets,
// à définir en variable d'environnement (.env en dev, config Lambda en prod)
module.exports = {
  azure: {
    tenantId:     '',
    clientId:     '',
    redirectUri:  'http://localhost:3000/auth/callback',
  },
  urls: {
    frontend: '',
  },
  n8n: {
    suggestionUrl:       '/webhook/suggestion',
    nouvelAchatUrl:      '/webhook/nouvel-achat',
    nouvelAbonnementUrl: '/webhook/nouvel-abonnement',
    modificationCcolUrl: '/webhook/modification-ccol',
    pebTipasaUrl:        '/webhook/peb-tipasa',
    requeteAcqUrl:       '/webhook/requete-accessibilite',
    springerUrl:         '/webhook/springer',
  },
};
