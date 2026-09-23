const auth              = require('./auth');
const config             = require('../config/config');
const { isBibUsager, groupeForRole } = require('./roles');
const UtilisateursModel  = require('../models/utilisateurs');

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

    // Porte d'entrée : la personne doit être membre du groupe Azure AD bib-usagers
    // (App Role), sinon elle n'a rien à faire dans cette application.
    if (!isBibUsager(userInfo)) {
      console.warn(`Accès refusé (hors bib-usagers): ${userInfo.preferred_username || userInfo.email}`);
      return res.redirect(`${config.urls.frontend}/login?error=acces_non_autorise`);
    }

    const email  = userInfo.preferred_username || userInfo.email || '';
    const nom    = userInfo.family_name || '';
    const prenom = userInfo.given_name || '';

    // Rôle applicatif (Admin/TDM/Usager) géré en base locale, pas par Azure AD —
    // voir models/utilisateurs.js. Premier login = création avec rôle Usager par
    // défaut ; un admin doit ensuite promouvoir la personne au besoin.
    const utilisateur = await UtilisateursModel.upsertFromLogin({ email, nom, prenom });

    const token = auth.signToken({
      sub:    userInfo.oid || userInfo.sub,
      email,
      nom,
      prenom,
      groupe: groupeForRole(utilisateur.role),
      role:   utilisateur.role,
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
