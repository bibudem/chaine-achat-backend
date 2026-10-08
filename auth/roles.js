// N'est plus une porte d'entrée (tout compte UdeM authentifié entre désormais, voir
// auth/callback.js) : sert uniquement à distinguer, au premier login, le personnel des
// bibliothèques (rôle Employe) du reste de la communauté UdeM (rôle Usager, accès restreint
// à ses propres demandes). Le rôle exact (Admin/TDM/Employe/Usager/SuperAdmin) est ensuite
// géré dans tbl_utilisateurs (base locale), indépendamment d'Azure — voir
// models/utilisateurs.js et auth/callback.js.
const GROUPES_BIB_USAGER = ['BIB-USAGERS', 'BIB-USAGERS-SURVIVANTS'];

// Libellé affiché côté frontend (sessionStorage groupeAdmin) pour chaque rôle.
const GROUPE_BY_ROLE = {
  SuperAdmin: 'Gestionnaire',
  Admin:  'Administrateur',
  TDM:    'TDM',
  Employe: 'Employé',
  TechDoc: 'TechDoc',
  Usager: 'Usager',
};

/**
 * Vrai si la personne est membre d'un des App Roles Azure AD ci-dessus (personnel des
 * bibliothèques) — détermine le rôle Employe vs Usager au premier login. Insensible à la
 * casse/espaces (évite qu'un simple écart de saisie dans Azure change silencieusement le
 * rôle attribué).
 */
function isBibUsager(userInfo) {
  const raw = userInfo.roles;
  const azureRoles = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map(r => String(r).trim().toUpperCase());
  return GROUPES_BIB_USAGER.some(g => azureRoles.includes(g));
}

function groupeForRole(role) {
  return GROUPE_BY_ROLE[role] || 'Usager';
}

module.exports = { isBibUsager, groupeForRole };
