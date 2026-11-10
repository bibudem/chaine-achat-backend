const auth = require('../auth/auth');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Non authentifié' });
  }
  try {
    req.user = auth.verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token invalide ou expiré' });
  }
}

// À utiliser après requireAuth. Ex. : router.get('/', requireAuth, requireRole('Admin'), ctrl.list)
function requireRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!rolesAutorises.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
    next();
  };
}

// Personnel des bibliothèques (tout sauf la communauté UdeM, rôle Usager) — minimum exigé
// pour toutes les routes de l'application, sauf la connexion et la suggestion publique.
const ROLES_PERSONNEL = ['Admin', 'SuperAdmin', 'TDM', 'Employe', 'TechDocTri'];
const requirePersonnel = [requireAuth, requireRole(...ROLES_PERSONNEL)];
// Administration (même règle que AdminGuard / canEdit côté frontend).
const requireAdmin = [requireAuth, requireRole('Admin', 'SuperAdmin')];
// Écriture dans le sous-menu Configuration (fonds, bibliothèques, taux de change, utilisateurs) :
// SuperAdmin seulement — l'Admin y a accès en lecture seule.
const requireSuperAdmin = [requireAuth, requireRole('SuperAdmin')];

module.exports = { requireAuth, requireRole, requirePersonnel, requireAdmin, requireSuperAdmin, ROLES_PERSONNEL };
