const crypto = require('crypto');
const config = require('../config/config');
const CourrielsModel = require('../models/courriels');
const { posterN8n } = require('../util/notifications-n8n');

const COURRIEL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/** « a@x; b@y » → « a@x, b@y » (format attendu par le nœud courriel n8n). Null si une
 *  adresse est invalide. */
function normaliserAdresses(valeur) {
  const liste = String(valeur || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
  if (!liste.length || liste.some(a => !COURRIEL_RE.test(a))) return null;
  return liste.join(', ');
}

/** Identifiant entier positif, sinon null (valeur venant du navigateur). */
function entierOuNull(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function secretValide(recu) {
  const attendu = config.courrielRetourSecret;
  if (!attendu || typeof recu !== 'string') return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const CourrielsController = {

  /** GET /courriels — Registres → Courriels envoyés. */
  async lister(req, res) {
    try {
      const limit  = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const result = await CourrielsModel.lister({
        q:      String(req.query.q      || ''),
        type:   String(req.query.type   || ''),
        statut: String(req.query.statut || ''),
        du:     String(req.query.du     || ''),
        au:     String(req.query.au     || ''),
        limit, offset,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[courriels] lister:', err);
      res.status(500).json({ success: false, error: 'Erreur lors du chargement des courriels.' });
    }
  },

  /** GET /courriels/item/:id — historique d'une demande. */
  async parItem(req, res) {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) return res.status(400).json({ success: false, error: 'Identifiant invalide.' });
    try {
      res.json({ success: true, data: await CourrielsModel.parItem(itemId) });
    } catch (err) {
      console.error('[courriels] parItem:', err);
      res.status(500).json({ success: false, error: 'Erreur lors du chargement des courriels.' });
    }
  },

  /** POST /courriels/decision — courriel de suivi envoyé depuis la page de décision ACQ, un
   *  appel n8n (webhook statut-decision) par destinataire coché. */
  async envoyerDecision(req, res) {
    const b = req.body || {};
    // Au plus 10 destinataires (la page en propose 4) ; entrées mal formées ignorées.
    const destinataires = (Array.isArray(b.destinataires) ? b.destinataires : [])
      .filter(d => d && typeof d === 'object').slice(0, 10);
    const itemId    = entierOuNull(b.item_id);
    const reponseId = entierOuNull(b.reponse_id);
    if (!destinataires.length) {
      return res.status(400).json({ success: false, error: 'Aucun destinataire.' });
    }
    if (!itemId) {
      return res.status(400).json({ success: false, error: 'Demande invalide.' });
    }
    const u = req.user || {};
    const declencheParNom = [u.prenom, u.nom].filter(Boolean).join(' ') || null;
    const resultats = [];

    for (const d of destinataires) {
      const adresses = normaliserAdresses(d.email);
      if (!adresses) {
        resultats.push({ email: d.email, ok: false, erreur: 'Adresse invalide' });
        continue;
      }
      const ok = await posterN8n(config.n8n.statutDecisionUrl, 'statut-decision', itemId, {
        reponse_id:        reponseId,
        item_id:           itemId,
        suivi_acq:         b.suivi_acq ?? null,
        note_acq:          b.note_acq ?? null,
        usager_courriel:   adresses,
        usager_nom:        d.nom || null,
        titre_document:    b.titre_document ?? null,
        type_formulaire:   b.type_formulaire ?? null,
        notif_role:        d.label || null,
        // Copie à l'équipe de tri : une seule fois, avec le courriel au demandeur.
        aviser_equipe_tri: !!b.aviser_equipe_tri && d.key === 'saisie',
        tri_par:           b.tri_par ?? null,
      }, {
        destinataire:      adresses,
        role_destinataire: d.label || null,
        noeud:             'Envoyer email — Usager',
        contenu:           { suivi_acq: b.suivi_acq ?? null, note_acq: b.note_acq ?? null },
        declenche_par:     u.email || null,
        declenche_par_nom: declencheParNom,
      });
      resultats.push({ email: d.email, ok });
    }
    res.json({ success: resultats.every(r => r.ok), resultats });
  },

  /** POST /courriels/retour — appelé par n8n après chaque envoi (succès ou échec). Protégé par
   *  le secret partagé (en-tête X-Courriel-Secret), pas par une session. */
  async retour(req, res) {
    if (!secretValide(req.get('X-Courriel-Secret'))) {
      return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    const { envoi_ref, noeud, statut, destinataire, erreur } = req.body || {};
    if (!envoi_ref || !noeud || !['envoye', 'echec'].includes(statut)) {
      return res.status(400).json({ success: false, error: 'Champs requis : envoi_ref, noeud, statut.' });
    }
    try {
      const trouve = await CourrielsModel.enregistrerRetour({
        envoi_ref: String(envoi_ref),
        noeud:     String(noeud).slice(0, 100),
        statut,
        destinataire: destinataire ? String(destinataire).slice(0, 1000) : null,
        erreur:       erreur ? String(erreur).slice(0, 2000) : null,
      });
      if (!trouve) return res.status(404).json({ success: false, error: 'Envoi inconnu.' });
      res.json({ success: true });
    } catch (err) {
      console.error('[courriels] retour:', err);
      res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement du statut.' });
    }
  },
};

module.exports = CourrielsController;
