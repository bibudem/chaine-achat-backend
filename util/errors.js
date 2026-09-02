// util/errors.js
//
// Message d'erreur sûr à renvoyer au client. En production, les messages d'exception bruts
// (souvent des messages PostgreSQL révélant noms de tables/colonnes/structure de requête) ne
// sont jamais renvoyés — seul `fallback` l'est. Le détail complet reste dans les logs serveur
// (console.error), inchangé partout où cette fonction est utilisée.
function publicError(err, fallback = 'Erreur serveur interne') {
  if (process.env.NODE_ENV === 'production') return fallback;
  return (err && err.message) || fallback;
}

module.exports = { publicError };
