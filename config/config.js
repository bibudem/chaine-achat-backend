const envName = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

let envConfig = {};
try {
  envConfig = require(`./config.${envName}`);
} catch (e) {
  console.warn(`⚠️  config/config.${envName}.js introuvable — copiez config.example.js en config.${envName}.js et remplissez-le`);
}

module.exports = {
  azure: {
    tenantId:     envConfig.azure?.tenantId     || '',
    clientId:     envConfig.azure?.clientId     || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    redirectUri:  envConfig.azure?.redirectUri  || 'http://localhost:3000/auth/callback',
    scopes:       ['openid', 'profile', 'email'],
  },
  // Seul N8N_BASE_URL est un secret (l'hôte n8n) ; les chemins des webhooks viennent de config.{dev,prod}.js
  n8n: (() => {
    const base  = process.env.N8N_BASE_URL || '';
    const paths = envConfig.n8n || {};
    const url   = path => (base && path) ? `${base}${path}` : '';
    return {
      baseUrl:             base,
      suggestionUrl:       url(paths.suggestionUrl),
      nouvelAchatUrl:      url(paths.nouvelAchatUrl),
      nouvelAbonnementUrl: url(paths.nouvelAbonnementUrl),
      modificationCcolUrl: url(paths.modificationCcolUrl),
      pebTipasaUrl:        url(paths.pebTipasaUrl),
      requeteAcqUrl:       url(paths.requeteAcqUrl),
      springerUrl:         url(paths.springerUrl),
    };
  })(),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-changez-en-prod',
  },
  urls: {
    frontend: envConfig.urls?.frontend || 'http://localhost:4200',
  },
  proxy: {
    host: process.env.PROXY_HOST || '',
    port: parseInt(process.env.PROXY_PORT || '80', 10),
  },
  ports: {
    client: 4200,
    server: parseInt(process.env.PORT || '3000', 10),
  },
};
