// Mappage des App Roles Azure AD (Enterprise application → App roles) vers les rôles
// de l'application (Admin / TDM / Usager — vocabulaire attendu par le frontend Angular).
const ROLE_BY_AZURE_VALUE = {
  'SPS-ADMIN':              'Admin',
  'DCOL-RES':               'TDM',
  'BIB-USAGERS':            'Usager',
  'BIB-USAGERS-SURVIVANTS': 'Usager',
};

// Libellé affiché côté frontend (sessionStorage groupeAdmin) pour chaque rôle.
const GROUPE_BY_ROLE = {
  Admin:  'Gestionnaire',
  TDM:    'TDM',
  Usager: 'Usager',
};

// Accès Admin garanti, indépendamment des App Roles assignés dans Azure AD.
const ADMIN_OVERRIDE_EMAILS = [
  'natalia.jabinschi@umontreal.ca',
  'mathieu.nicolas.tardif@umontreal.ca',
];

/** Rôle le plus élevé parmi les App Roles Azure AD assignés à l'usager (SPS-ADMIN > DCOL-RES > BIB-*). */
function resolveRole(userInfo) {
  const email = (userInfo.preferred_username || userInfo.email || '').toLowerCase();
  if (ADMIN_OVERRIDE_EMAILS.includes(email)) {
    return 'Admin';
  }

  const azureRoles = userInfo.roles || [];
  if (azureRoles.includes('SPS-ADMIN')) return 'Admin';
  if (azureRoles.includes('DCOL-RES'))  return 'TDM';
  if (azureRoles.some(r => r === 'BIB-USAGERS' || r === 'BIB-USAGERS-SURVIVANTS')) return 'Usager';

  // Aucun App Role reconnu assigné : accès minimal par défaut.
  return 'Usager';
}

function groupeForRole(role) {
  return GROUPE_BY_ROLE[role] || 'Usager';
}

module.exports = { resolveRole, groupeForRole, ROLE_BY_AZURE_VALUE };
