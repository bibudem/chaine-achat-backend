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

    // Porte d'entrée : tout compte UdeM authentifié entre dans l'application — bib-usagers
    // ne sert plus qu'à déterminer le rôle par défaut au premier login, voir plus bas.
    const email  = userInfo.preferred_username || userInfo.email || '';
    const nom    = userInfo.family_name || '';
    const prenom = userInfo.given_name || '';

    // Rôle applicatif : celui du profil en base s'il existe (SuperAdmin, Admin, TechDoc, TDM…,
    // créés dans Configuration > Utilisateurs — voir models/utilisateurs.js). Sinon, aucun
    // profil n'est créé : Employe si membre bib-usagers (personnel des bibliothèques), Usager
    // sinon (reste de la communauté UdeM), déduit à chaque login.
    const utilisateur = await UtilisateursModel.majConnexion({ email, nom, prenom });
    const role = utilisateur?.role || (isBibUsager(userInfo) ? 'Employe' : 'Usager');

    const token = auth.signToken({
      sub:    userInfo.oid || userInfo.sub,
      email,
      nom,
      prenom,
      groupe: groupeForRole(role),
      role,
      // TEMPORAIRE — debug, à retirer : toutes les claims brutes du ID token Azure AD
      azureRaw: userInfo,
    });

    // Connexion lancée en popup depuis le formulaire public embarqué (voir routes/auth.js).
    const popup = String(req.query.state || '').endsWith('.popup') ? '&popup=1' : '';
    res.redirect(`${config.urls.frontend}/auth-callback?token=${encodeURIComponent(token)}${popup}`);
  } catch (e) {
    console.error('Erreur échange token OAuth:', e.message);
    res.redirect(`${config.urls.frontend}/login?error=token_exchange_failed`);
  }
}

module.exports = { handleCallback };
