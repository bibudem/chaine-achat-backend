const config = require('../config/config');
const axios  = require('axios');
const jwt    = require('jwt-simple');

const AUTHORITY = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0`;

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     config.azure.clientId,
    response_type: 'code',
    redirect_uri:  config.azure.redirectUri,
    scope:         config.azure.scopes.join(' '),
    state,
    response_mode: 'query',
  });
  return `${AUTHORITY}/authorize?${params}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id:     config.azure.clientId,
    client_secret: config.azure.clientSecret,
    code,
    redirect_uri:  config.azure.redirectUri,
    grant_type:    'authorization_code',
    scope:         config.azure.scopes.join(' '),
  });
  const { data } = await axios.post(`${AUTHORITY}/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

function parseIdToken(idToken) {
  const raw = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
}

function signToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.encode({ ...claims, iat: now, exp: now + 8 * 3600 }, config.jwt.secret);
}

function verifyToken(token) {
  const decoded = jwt.decode(token, config.jwt.secret);
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expiré');
  }
  return decoded;
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  parseIdToken,
  signToken,
  verifyToken,
  // Compatibilité avec util/lib.js (legacy)
  passport: { session: { userConnect: null } },
};
