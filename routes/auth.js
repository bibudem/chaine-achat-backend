const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const auth     = require('../auth/auth');
const callback = require('../auth/callback');
const config   = require('../config/config');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTES AUTHENTIFICATION AZURE AD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// GET /auth/login → redirige l'usager vers Azure AD
router.get('/login', (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.redirect(auth.buildAuthUrl(state));
});

// GET /auth/callback → reçoit le code d'Azure AD, échange pour un JWT
router.get('/callback', callback.handleCallback);

// GET /auth/logout → déconnexion Azure AD + retour frontend
router.get('/logout', (_req, res) => {
  const post = encodeURIComponent(config.urls.frontend);
  const url  = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${post}`;
  res.redirect(url);
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SIMULATION LOCALE (dev uniquement)
   GET /auth/dev-login?role=admin|acq|usager
   → crée un JWT directement, sans passer par Azure AD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
if (process.env.NODE_ENV !== 'production') {
  const DEV_PROFILES = {
    admin:    { sub: 'dev-admin-001',  email: 'admin@udem.dev',  name: 'Admin Dev',          roles: ['admin'] },
    acq:      { sub: 'dev-acq-001',    email: 'acq@udem.dev',    name: 'Bibliothécaire ACQ',  roles: ['acq'] },
    usager:   { sub: 'dev-usager-001', email: 'usager@udem.dev', name: 'Usager Test',         roles: ['usager'] },
  };

  router.get('/dev-login', (req, res) => {
    const profile = DEV_PROFILES[req.query.role] || DEV_PROFILES.usager;
    const token   = auth.signToken(profile);
    res.redirect(`${config.urls.frontend}/auth-callback?token=${encodeURIComponent(token)}`);
  });
}

module.exports = router;
