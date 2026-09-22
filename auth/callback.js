const auth   = require('./auth');
const config = require('../config/config');
const { resolveRole, groupeForRole } = require('./roles');

async function handleCallback(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error(`OAuth error [${error}]: ${error_description}`);
    return res.redirect(`${config.urls.frontend}/login?error=auth_failed`);
  }

  if (!code) {
    return res.status(400).json({ success: false, error: 'Code d\'autorisation manquant' });
  }

  try {
    const tokens   = await auth.exchangeCode(code);
    const userInfo = auth.parseIdToken(tokens.id_token);

    // Rôle déterminé à partir des App Roles Azure AD (SPS-ADMIN/DCOL-RES/BIB-USAGERS*)
    // — voir auth/roles.js.
    const role = resolveRole(userInfo);
    const token = auth.signToken({
      sub:    userInfo.oid || userInfo.sub,
      email:  userInfo.preferred_username || userInfo.email || '',
      nom:    userInfo.family_name || '',
      prenom: userInfo.given_name || '',
      groupe: groupeForRole(role),
      role,
      // TEMPORAIRE — debug, à retirer : toutes les claims brutes du ID token Azure AD
      azureRaw: userInfo,
    });

    res.redirect(`${config.urls.frontend}/auth-callback?token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error('Erreur échange token OAuth:', e.message);
    res.redirect(`${config.urls.frontend}/login?error=token_exchange_failed`);
  }
}

module.exports = { handleCallback };
