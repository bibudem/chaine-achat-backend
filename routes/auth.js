const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const auth        = require('../auth/auth');
const callback    = require('../auth/callback');
const config      = require('../config/config');
const { requireAuth } = require('../middleware/jwt.middleware');

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

// GET /auth/logout → déconnexion Azure AD + retour frontend sur /login
// Important : https://.../login doit être enregistré dans les Redirect URIs de l'app
// registration Azure AD (en plus de la racine), sinon Microsoft refuse la redirection.
router.get('/logout', (_req, res) => {
  const post = encodeURIComponent(`${config.urls.frontend}/login`);
  const url  = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${post}`;
  res.redirect(url);
});

// GET /auth/me → infos de l'usager connecté, à partir du JWT
// TEMPORAIRE — debug, à retirer : renvoie tout le contenu du JWT (incluant azureRaw,
// les claims brutes du ID token Azure AD) au lieu de seulement nom/prenom/email/groupe/role.
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SIMULATION LOCALE (dev uniquement)
   GET /auth/dev-login?role=admin|acq|usager
   → crée un JWT directement, sans passer par Azure AD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
if (process.env.NODE_ENV !== 'production') {
  const DEV_PROFILES = {
    admin:  { sub: 'dev-admin-001',  email: 'admin@udem.dev',  nom: 'Admin',       prenom: 'Système', groupe: 'Gestionnaire', role: 'Admin' },
    acq:    { sub: 'dev-acq-001',    email: 'acq@udem.dev',    nom: 'TDM',         prenom: 'Agent',   groupe: 'TDM',          role: 'TDM' },
    usager: { sub: 'dev-usager-001', email: 'usager@udem.dev', nom: 'Bibliothèques', prenom: 'Test',  groupe: 'Usager',       role: 'Usager' },
  };

  router.get('/dev-login', (req, res) => {
    const profile = DEV_PROFILES[req.query.role] || DEV_PROFILES.usager;
    const token   = auth.signToken(profile);
    res.redirect(`${config.urls.frontend}/auth-callback?token=${encodeURIComponent(token)}`);
  });
}

module.exports = router;
