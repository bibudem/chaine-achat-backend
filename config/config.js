module.exports = {
  azure: {
    tenantId:     process.env.AZURE_TENANT_ID     || '',
    clientId:     process.env.AZURE_CLIENT_ID     || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    redirectUri:  process.env.AZURE_REDIRECT_URI  || 'http://localhost:3000/auth/callback',
    scopes:       ['openid', 'profile', 'email'],
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-changez-en-prod',
  },
  urls: {
    frontend: process.env.FRONTEND_URL || 'http://localhost:4200',
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
