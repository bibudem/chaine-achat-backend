// Config de production (gitignoré — ne jamais committer)
// Bundlé dans function.zip par pack.js et déployé sur AWS Lambda.
// clientSecret, JWT_SECRET et N8N_BASE_URL restent injectés comme variables d'environnement Lambda
// (secrets — jamais dans le zip)
module.exports = {
  azure: {
    tenantId:     'd27eefec-2a47-4be7-981e-0f8977fa31d8',
    clientId:     '97183293-1a02-4c22-9dbf-42132d7d522c',
    redirectUri:  'https://2q5xuhn9z7.execute-api.ca-central-1.amazonaws.com/auth/callback',
  },
  urls: {
    frontend: 'https://achats.bib.umontreal.ca/',
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
