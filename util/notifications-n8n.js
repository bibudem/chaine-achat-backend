// Notifications par événement vers le webhook n8n /notifications (un seul webhook, le champ
// `evenement` indique de quoi il s'agit — voir le nœud « 🔀 Aiguillage » du workflow n8n).
//
// Événements :
//  - 'suggestion-soumise-acq' : une suggestion publique acceptée par l'équipe TechDoc vient
//                               d'être soumise aux ACQ → courriel à la BAL ACQ.
//  - 'notice-tdm'             : une demande traitée par les ACQ requiert une création de
//                               notice → courriel à la BAL TDM.
const axios  = require('axios');
const config = require('../config/config');

// Valeur par défaut de suivi_acq tant que les ACQ n'ont pas réellement traité la demande
// (même valeur que ACQ_SUIVI_DEFAUT côté frontend, lib/DemandeStatut.ts).
const SUIVI_ACQ_DEFAUT = 'En attente de traitement';

// Délai maximal d'un appel à n8n : l'usager attend la notification avant d'avoir sa réponse.
const N8N_TIMEOUT_MS = 5000;

/** Appel à un webhook n8n, à attendre (await) AVANT de renvoyer la réponse HTTP : sur AWS
 *  Lambda, l'environnement est gelé dès la réponse envoyée, et un appel non attendu ne part
 *  jamais (en local, le processus reste vivant, d'où l'écart local/production).
 *  Ne lève jamais d'erreur : un échec de n8n ne doit pas faire échouer l'action de l'usager. */
async function posterN8n(url, logKey, refId, payload) {
  if (!url) {
    console.warn(`⚠️  [${logKey}] URL n8n non configurée (N8N_BASE_URL ?) — notification ignorée (#${refId})`);
    return;
  }
  try {
    await axios.post(url, { ...payload, app_url: config.urls.frontend }, { timeout: N8N_TIMEOUT_MS });
    console.log(`✅ [${logKey}] n8n notifié — #${refId}`);
  } catch (err) {
    console.error(`❌ [${logKey}] n8n non joignable (${url}):`, err.message);
    if (err.response) console.error(`   Status: ${err.response.status}`);
  }
}

/** Événement vers le webhook /notifications (champ `evenement`). */
function notifierEvenement(evenement, refId, payload) {
  return posterN8n(config.n8n.notificationsUrl, evenement, refId, { ...payload, evenement });
}

/** Vrai si l'item est traité par les ACQ (suivi renseigné, autre que la valeur par défaut) et
 *  requiert une création de notice TDM. La notification part au passage de faux à vrai. */
function noticeTdmRequise(item) {
  return !!item
    && item.creation_notice_dtdm === true
    && !!item.suivi_acq
    && item.suivi_acq !== SUIVI_ACQ_DEFAUT;
}

/** Notifie la BAL TDM si l'item vient de passer à « notice TDM requise ». */
function notifierNoticeTdmSiNouvelle(avant, apres) {
  if (!noticeTdmRequise(apres) || noticeTdmRequise(avant)) return Promise.resolve();
  return notifierEvenement('notice-tdm', apres.item_id, {
    item_id:             apres.item_id,
    type_formulaire:     apres.formulaire_type,
    titre_document:      apres.titre_document,
    sous_titre:          apres.sous_titre,
    editeur:             apres.editeur,
    isbn_issn:           apres.isbn_issn,
    bibliotheque:        apres.bibliotheque,
    demandeur:           apres.demandeur,
    format_support:      apres.format_support,
    categorie_document:  apres.categorie_document,
    suivi_acq:           apres.suivi_acq,
    statut_acq:          apres.statut_acq,
    note_dtdm:           apres.note_dtdm,
  });
}

module.exports = { posterN8n, notifierEvenement, notifierNoticeTdmSiNouvelle };
