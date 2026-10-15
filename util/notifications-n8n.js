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

/** Fire-and-forget : un échec de n8n ne doit jamais faire échouer l'action de l'usager. */
function notifierEvenement(evenement, refId, payload) {
  const url = config.n8n.notificationsUrl;
  if (!url) {
    console.warn(`⚠️  [${evenement}] notificationsUrl non configurée — notification ignorée (#${refId})`);
    return;
  }
  axios.post(url, { ...payload, evenement, app_url: config.urls.frontend })
    .then(() => console.log(`✅ [${evenement}] n8n notifié — #${refId}`))
    .catch(err => console.error(`❌ [${evenement}] n8n non joignable:`, err.message));
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
  if (!noticeTdmRequise(apres) || noticeTdmRequise(avant)) return;
  notifierEvenement('notice-tdm', apres.item_id, {
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

module.exports = { notifierEvenement, notifierNoticeTdmSiNouvelle };
