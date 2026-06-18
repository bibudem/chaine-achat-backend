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

module.exports = { requireAuth };
