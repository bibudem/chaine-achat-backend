// Azure AD (App Role BIB-USAGERS/BIB-USAGERS-SURVIVANTS) sert de porte d'entrée :
// confirme que la personne fait partie du personnel/usagers des bibliothèques.
// Le rôle exact (Admin/TDM/Usager) est géré dans tbl_utilisateurs (base locale),
// indépendamment d'Azure — voir models/utilisateurs.js et auth/callback.js.
const GROUPES_BIB_USAGER = ['BIB-USAGERS', 'BIB-USAGERS-SURVIVANTS'];

// Libellé affiché côté frontend (sessionStorage groupeAdmin) pour chaque rôle.
const GROUPE_BY_ROLE = {
  Admin:  'Gestionnaire',
  TDM:    'TDM',
  Usager: 'Usager',
};

/**
 * Porte d'entrée de l'application : la personne doit être membre d'un des App
 * Roles Azure AD ci-dessus. Insensible à la casse/espaces (évite qu'un simple
 * écart de saisie dans Azure bloque silencieusement un accès légitime).
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
