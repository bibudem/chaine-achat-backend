const pool = require('../config/postgres.config');
const PiecesJointesModel = require('./pieces-jointes');
const { filterToTableColumns } = require('../util/db-columns');

// ── Helpers internes ──────────────────────────────────────────────────────────

function cleanEmptyFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  );
}

const TYPE_TABLE_MAP = {
  'Modification et CCOL':        'tbl_modification_ccol',
  'Nouvel abonnement':           'tbl_nouvel_abonnement',
  'Nouvel achat unique':         'tbl_nouvel_achat_unique',
  'PEB Tipasa numérique':        'tbl_peb_tipasa_numerique',
  'Requête ACQ Accessibilité':   'tbl_requete_acq',
  "Suggestion d'achat - Usager": 'tbl_suggestion_achat',
};

async function insertSpecificTable(client, itemId, formulaireType, data) {
  const tableName = TYPE_TABLE_MAP[formulaireType];
  if (!tableName) return;
  const cleanedRaw = cleanEmptyFields(data);
  // Sécurité : ne garder que des clés qui sont de vraies colonnes de `tableName` — `data`
  // vient du JSON de la demande stockée par l'usager, voir util/db-columns.js.
  const clean = await filterToTableColumns(tableName, cleanedRaw, ['item_id']);
  if (!Object.keys(clean).length) return;
  const cols = ['item_id', ...Object.keys(clean)];
  const vals = [itemId, ...Object.values(clean)];
  const phs  = vals.map((_, i) => `$${i + 1}`).join(', ');
  const upd  = Object.keys(clean).map(k => `${k} = EXCLUDED.${k}`).join(', ');
  await client.query(
    `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${phs})
     ON CONFLICT (item_id) DO UPDATE SET ${upd}`,
    vals
  );
}

// Clés propres aux tables spécifiques de Suggestion (format plat)
const SUGGESTION_SPEC_KEYS = [
  'auteur', 'usager_nom', 'usager_faculte', 'bibliothecaire_disciplinaire',
  'aviser_reservation', 'aviser_reception', 'date_requise_cours',
  'note_usager', 'reserve_cours', 'reserve_cours_sigle', 'bordereau_imprime',
  'acq_raison_annulation', 'techdoc_suggestion_transmise', 'acq_isbn',
  'acq_responsable_courriel',
];

const ReponsesModel = {

  // ═══════════════════════════════════════════════════════════
  // SUGGESTION D'ACHAT
  // ═══════════════════════════════════════════════════════════

  async createSuggestion({ usager_nom, usager_courriel, usager_statut, reponses }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_reponses
         (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, "dateA"`,
      [
        "Suggestion d'achat - Usager",
        usager_nom,
        usager_courriel,
        usager_statut,
        JSON.stringify(reponses || {})
      ]
    );
    return rows[0];
  },

  async insererSuggestionApresApprobation(reponse) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // reponses peut être une string JSON (colonne TEXT) ou déjà un objet (JSONB)
      const raw = reponse.reponses;
      const r   = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});

      // 1. tbl_items
      const { rows } = await client.query(
        `INSERT INTO tbl_items (
          formulaire_type, date_creation, priorite_demande,
          titre_document, isbn_issn, editeur, date_publication,
          categorie_document, format_support, 
          nombre_utilisateurs, source_information,
          bibliotheque, demandeur,
          note_commentaire, statut_bibliotheque, statut_acq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING item_id`,
        [
          "Suggestion d'achat - Usager",                              // $1
          new Date(),                                        // $2
          r.priorite_demande    || 'Urgent',                // $3
          r.titre_document      || null,                     // $4
          r.isbn_issn           || null,                     // $5
          r.editeur             || null,                     // $6
          r.date_publication    || null,                     // $7
          r.categorie_document  || null,                     // $8
          r.format_support      || null,                     // $9
          // nombre_utilisateurs : non collecté par le formulaire Suggestion (à plat)
          null,                                               // $10
          r.source_information  || null,                     // $11
          r.bibliotheque        || null,                     // $12
          reponse.usager_nom    || null,                     // $13
          r.note_commentaire    || null,                     // $14
          'En attente en bibliothèque',                      // $15
          'En attente'                                       // $16
        ]
      );
      const itemId = rows[0].item_id;

      // 2. tbl_suggestion_achat
      await client.query(
        `INSERT INTO tbl_suggestion_achat (
          item_id, auteur, usager_nom, usager_statut, usager_faculte, usager_courriel,
          bibliothecaire_disciplinaire, aviser_reservation, aviser_reception, date_requise_cours
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (item_id) DO UPDATE SET
          auteur                       = EXCLUDED.auteur,
          usager_nom                   = EXCLUDED.usager_nom,
          bibliothecaire_disciplinaire = EXCLUDED.bibliothecaire_disciplinaire,
          aviser_reservation           = EXCLUDED.aviser_reservation,
          aviser_reception             = EXCLUDED.aviser_reception,
          date_requise_cours           = EXCLUDED.date_requise_cours`,
        [
          itemId,
          r.auteur                         || null,
          // Nom de l'usager (étudiant/prof/chercheur) saisi dans le formulaire — distinct de
          // reponse.usager_nom (le·la TechDoc qui soumet, déjà utilisé pour tbl_items.demandeur).
          r.usager_nom                     || null,
          reponse.usager_statut            || null,
          r.usager_faculte                 || null,
          reponse.usager_courriel          || null,
          r.bibliothecaire_disciplinaire   || null,
          r.aviser_reservation === true || r.aviser_reservation === 'true',
          r.aviser_reception   === true || r.aviser_reception   === 'true',
          r.date_requise_cours             || null
        ]
      );

      // 3. Réserve de cours (optionnel)
      if (r.reserve_cours === true || r.reserve_cours === 'true') {
        await client.query(
          `INSERT INTO tbl_nouvel_achat_unique (item_id, reserve_cours, reserve_cours_sigle)
           VALUES ($1, true, $2)
           ON CONFLICT (item_id) DO UPDATE SET
             reserve_cours       = true,
             reserve_cours_sigle = EXCLUDED.reserve_cours_sigle`,
          [itemId, r.reserve_cours_sigle || null]
        );
      }

      // 4. Lier la réponse à l'item créé
      await client.query(
        'UPDATE tbl_reponses SET item_id_cree = $1 WHERE id = $2',
        [itemId, reponse.id]
      );

      // 5. Relier les pièces jointes déjà uploadées sur cette réponse
      await PiecesJointesModel.lierItem(client, reponse.id, itemId);

      await client.query('COMMIT');
      return itemId;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // NOUVEL ACHAT UNIQUE
  // ═══════════════════════════════════════════════════════════

  async createNouvelAchat({ usager_nom, usager_courriel, usager_statut, reponses }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_reponses
         (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, "dateA"`,
      [
        'Nouvel achat unique',
        usager_nom,
        usager_courriel,
        usager_statut,
        JSON.stringify(reponses || {})
      ]
    );
    return rows[0];
  },

  async insererNouvelAchatApresApprobation(reponse) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const raw  = reponse.reponses;
      const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      const b = data.baseData     || {};
      const s = data.specificData || {};

      // 1. tbl_items
      const { rows } = await client.query(
        `INSERT INTO tbl_items (
          formulaire_type, date_creation, priorite_demande,
          titre_document, sous_titre, isbn_issn, editeur,
          date_publication, source_information, categorie_document,
          format_support, nombre_utilisateurs,
          lien_plateforme, nombre_titres_inclus, periode_couverte,
          prix_cad, devise_originale, prix_devise_originale,
          fonds_budgetaire, fonds_sn_projet,
          bibliotheque, localisation_emplacement, demandeur,
          personne_a_aviser_nom,
          personne_a_aviser_courriel,
          format_pret_numerique,
          statut_bibliotheque, statut_acq, note_commentaire,
          catalogue, creation_notice_dtdm,
          note_dtdm, utilisateur_modification, date_modification
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,NOW()
        ) RETURNING item_id`,
        [
          'Nouvel achat unique',                                                     // $1
          new Date(),                                                                // $2
          b.priorite_demande             || 'Régulier',                             // $3
          b.titre_document               || null,                                   // $4
          b.sous_titre                   || null,                                   // $5
          b.isbn_issn                    || null,                                   // $6
          b.editeur                      || null,                                   // $7
          b.date_publication             || null,                                   // $8
          b.source_information           || null,                                   // $9
          b.categorie_document           || null,                                   // $10
          b.format_support               || null,                                   // $11
          b.nombre_utilisateurs          || null,                                   // $12
          b.lien_plateforme              || null,                                   // $13
          b.nombre_titres_inclus         || null,                                   // $14
          b.periode_couverte             || null,                                   // $15
          b.prix_cad                     || null,                                   // $16
          b.devise_originale             || null,                                   // $17
          b.prix_devise_originale        || null,                                   // $18
          b.fonds_budgetaire             || null,                                   // $19
          b.fonds_sn_projet              || null,                                   // $20
          b.bibliotheque                 || null,                                   // $21
          b.localisation_emplacement     || null,                                   // $22
          reponse.usager_nom             || b.demandeur                  || null,   // $23
          b.personne_a_aviser_nom        || null,                                   // $24
          b.personne_a_aviser_courriel   || reponse.usager_courriel      || null,   // $25
          b.format_pret_numerique        || null,                                   // $26
          'Soumis aux ACQ : Formulaire complété et prêt à être transmis aux Acquisitions.', // $27
          'En attente de traitement aux ACQ',                                       // $28
          b.note_commentaire             || null,                                   // $29
          b.catalogue                    || null,                                   // $30
          b.creation_notice_dtdm === true || b.creation_notice_dtdm === 'true',    // $31
          b.note_dtdm                    || null,                                   // $32
          reponse.usager_nom             || null                                    // $33
        ]
      );
      const itemId = rows[0].item_id;

      // 2. tbl_nouvel_achat_unique
      await client.query(
        `INSERT INTO tbl_nouvel_achat_unique (
          item_id, id_ressource, projets_speciaux,
          type_monographie, format_electronique,
          reserve_cours, reserve_cours_sigle, reserve_cours_session,
          reserve_cours_enseignant, bordereau_imprime
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (item_id) DO UPDATE SET
          id_ressource             = EXCLUDED.id_ressource,
          type_monographie         = EXCLUDED.type_monographie,
          format_electronique      = EXCLUDED.format_electronique,
          reserve_cours            = EXCLUDED.reserve_cours,
          reserve_cours_sigle      = EXCLUDED.reserve_cours_sigle,
          reserve_cours_session    = EXCLUDED.reserve_cours_session,
          reserve_cours_enseignant = EXCLUDED.reserve_cours_enseignant`,
        [
          itemId,
          s.id_ressource                                       || null,  // $2
          s.projets_speciaux                                   || null,  // $3
          s.type_monographie                                   || null,  // $4
          s.format_electronique                                || null,  // $5
          s.reserve_cours === true || s.reserve_cours === 'true',        // $6
          s.reserve_cours ? (s.reserve_cours_sigle      || null) : null, // $7
          s.reserve_cours ? (s.reserve_cours_session    || null) : null, // $8
          s.reserve_cours ? (s.reserve_cours_enseignant || null) : null, // $9
          s.bordereau_imprime                                  || null   // $10
        ]
      );

      // Lier la réponse à l'item créé
      await client.query(
        'UPDATE tbl_reponses SET item_id_cree = $1 WHERE id = $2',
        [itemId, reponse.id]
      );

      // Relier les pièces jointes déjà uploadées sur cette réponse
      await PiecesJointesModel.lierItem(client, reponse.id, itemId);

      await client.query('COMMIT');
      return itemId;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // GÉNÉRIQUE — nouveaux types de formulaires
  // ═══════════════════════════════════════════════════════════

  async createFormulaire({ type_formulaire, usager_nom, usager_courriel, usager_statut, reponses }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_reponses
         (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, "dateA"`,
      [type_formulaire, usager_nom, usager_courriel, usager_statut, JSON.stringify(reponses || {})]
    );
    return rows[0];
  },

  async insererApresApprobation(reponse) {
    const { insertItemBase, insertSpecificData } = require('./import');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const raw  = reponse.reponses;
      const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      const baseData     = { formulaire_type: reponse.type_formulaire, ...(data.baseData || {}) };
      const specificData = data.specificData || {};
      const itemId = await insertItemBase(client, baseData);
      await insertSpecificData(client, itemId, reponse.type_formulaire, specificData);
      await client.query(
        'UPDATE tbl_reponses SET item_id_cree = $1 WHERE id = $2',
        [itemId, reponse.id]
      );
      // Relier les pièces jointes déjà uploadées sur cette réponse
      await PiecesJointesModel.lierItem(client, reponse.id, itemId);
      await client.query('COMMIT');
      return itemId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // COMMUN — décision + lecture
  // ═══════════════════════════════════════════════════════════

  async updateDecision({ id, statut_approbation, courriel_admin, commentaire_admin }) {
    const { rows } = await pool.query(
      `UPDATE tbl_reponses
       SET statut_approbation = $1,
           courriel_admin     = $2,
           date_traitement    = NOW(),
           commentaire_admin  = $3
       WHERE id = $4
       RETURNING *`,
      [statut_approbation, courriel_admin, commentaire_admin, id]
    );
    return rows[0] || null;
  },

  async findAll({ type = null, statut = null, suivi_acq = null, limit = 20, offset = 0 }) {
    const params     = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`r.type_formulaire = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`r.statut_approbation = $${params.length}`);
    }
    if (suivi_acq) {
      params.push(suivi_acq);
      conditions.push(`i.suivi_acq = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT r.id, r.type_formulaire, r.usager_nom, r.usager_courriel,
              r.usager_statut, r.reponses, r."dateA",
              r.statut_approbation, r.courriel_admin,
              r.date_traitement, r.commentaire_admin,
              r.item_id_cree,
              i.suivi_acq,
              COUNT(*) OVER() AS total_count
       FROM tbl_reponses r
       LEFT JOIN tbl_items i ON i.item_id = r.item_id_cree
       ${where}
       ORDER BY r."dateA" DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    return {
      rows,
      total: rows.length ? parseInt(rows[0].total_count) : 0
    };
  },

  // ── Créer l'item dans tbl_items depuis une réponse ───────────────────────────
  // Idempotent : si item_id_cree est déjà set, retourne l'id existant.
  async creerItemDepuisReponse(reponseId) {
    const reponse = await this.findById(reponseId);
    if (!reponse) throw new Error(`Réponse #${reponseId} introuvable`);
    if (reponse.item_id_cree) return reponse.item_id_cree;

    const raw  = reponse.reponses;
    const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});

    let baseData, specificData;
    if (data.baseData) {
      // Format structuré : tous les types sauf l'ancienne Suggestion
      baseData     = data.baseData;
      specificData = data.specificData || {};
    } else {
      // Format plat : Suggestion d'achat - Usager (ancien formulaire)
      specificData = {
        usager_statut:   reponse.usager_statut,
        usager_courriel: reponse.usager_courriel,
      };
      baseData = {};
      for (const [k, v] of Object.entries(data)) {
        if (SUGGESTION_SPEC_KEYS.includes(k)) specificData[k] = v;
        else baseData[k] = v;
      }
    }

    const cleanBase = cleanEmptyFields({
      formulaire_type: reponse.type_formulaire,
      demandeur:       baseData.demandeur || reponse.usager_nom,
      ...baseData,
    });

    // Ces champs appartiennent à tbl_reponses, tbl_suggestion_achat, ou aux méta-données de formulaire — pas à tbl_items
    for (const k of ['usager_nom', 'usager_statut', 'usager_courriel', 'send_notification']) {
      delete cleanBase[k];
    }

    // Normalisation : ancien nom de champ → nom de colonne tbl_items
    if ('note_interne_bib' in cleanBase) {
      if (!cleanBase.bibliotheque_note_interne) {
        cleanBase.bibliotheque_note_interne = cleanBase.note_interne_bib;
      }
      delete cleanBase.note_interne_bib;
    }

    // Une demande soumise directement avec statut_bibliotheque = "Soumettre aux ACQ" (sans
    // passer par l'édition admin) doit être visible dès sa création dans Recherche/Rapport :
    // on initialise les champs de décision ACQ à leur valeur "en attente" respective, s'ils
    // ne sont pas déjà fournis (mêmes valeurs que ItemFormulaireComponent côté admin).
    if (cleanBase.statut_bibliotheque === 'Soumettre aux ACQ') {
      if (!cleanBase.statut_acq) cleanBase.statut_acq = 'En attente';           // dircolAcqStatutOptions
      if (!cleanBase.suivi_acq)  cleanBase.suivi_acq  = 'En attente de traitement'; // dircolAcqSuiviOptions
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Sécurité : ne garder que des clés qui sont de vraies colonnes de tbl_items — cleanBase
      // vient du JSON de la demande stockée par l'usager, voir util/db-columns.js.
      const safeBase = await filterToTableColumns('tbl_items', cleanBase, ['item_id']);
      const cols = Object.keys(safeBase);
      const vals = Object.values(safeBase);
      const phs  = vals.map((_, i) => `$${i + 1}`).join(', ');

      const { rows } = await client.query(
        `INSERT INTO tbl_items (${cols.join(', ')}) VALUES (${phs}) RETURNING item_id`,
        vals
      );
      const itemId = rows[0].item_id;

      await insertSpecificTable(client, itemId, reponse.type_formulaire, specificData);

      await client.query(
        'UPDATE tbl_reponses SET item_id_cree = $1 WHERE id = $2',
        [itemId, reponseId]
      );

      // Relier les pièces jointes déjà uploadées sur cette réponse
      await PiecesJointesModel.lierItem(client, reponseId, itemId);

      await client.query('COMMIT');
      return itemId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Items en attente de statut bibliothèque ───────────────────────────────
  // Basé uniquement sur tbl_items (les demandes "Soumettre aux ACQ" y sont matérialisées
  // immédiatement — voir _materialiserItem côté contrôleur).
  // Avec statut_field/statut_value : filtre sur un champ précis de tbl_items (ex. suivi_acq)
  async getPending(limit = 5, statut_field = null, statut_value = null) {
    const ALLOWED_FIELDS = ['suivi_acq', 'statut_bibliotheque', 'statut_acq'];

    if (statut_field && statut_value) {
      if (!ALLOWED_FIELDS.includes(statut_field)) {
        throw new Error(`Champ de statut non autorisé : ${statut_field}`);
      }
      const col = statut_field; // validé par whitelist

      // Cas spécial statut_bibliotheque : les demandes soumises directement en "Soumettre aux ACQ"
      // sont matérialisées immédiatement dans tbl_items (voir _materialiserItem côté contrôleur) —
      // la notification se base donc uniquement sur tbl_items, plus besoin de couvrir le cas
      // "réponse pas encore convertie" séparément.
      if (col === 'statut_bibliotheque') {
        const [{ rows: reponses }, { rows: countRows }] = await Promise.all([
          pool.query(
            `SELECT COALESCE(r.id, i.item_id)                  AS id,
                    i.formulaire_type                            AS type_formulaire,
                    COALESCE(r.usager_nom, i.demandeur)         AS usager_nom,
                    i.date_creation                              AS "dateA",
                    CASE WHEN r.id IS NULL THEN 'import'
                         ELSE 'reponse-created' END              AS source,
                    i.item_id                                    AS item_id,
                    i.suivi_acq,
                    i.statut_acq
               FROM tbl_items i
               LEFT JOIN tbl_reponses r ON r.item_id_cree = i.item_id
              WHERE i.statut_bibliotheque = $2
                AND (i.suivi_acq  IS NULL OR i.suivi_acq  = '' OR i.suivi_acq  = 'En attente de traitement')
                AND (i.statut_acq IS NULL OR i.statut_acq = '' OR i.statut_acq = 'En attente')
              ORDER BY "dateA" DESC
              LIMIT $1`,
            [limit, statut_value]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS total
               FROM tbl_items i
              WHERE i.statut_bibliotheque = $1
                AND (i.suivi_acq  IS NULL OR i.suivi_acq  = '' OR i.suivi_acq  = 'En attente de traitement')
                AND (i.statut_acq IS NULL OR i.statut_acq = '' OR i.statut_acq = 'En attente')`,
            [statut_value]
          )
        ]);
        return { count: countRows[0].total, reponses };
      }

      // Autres champs (suivi_acq, statut_acq) : filtre direct sur tbl_items
      const [{ rows: reponses }, { rows: countRows }] = await Promise.all([
        pool.query(
          `SELECT COALESCE(r.id, i.item_id)                                       AS id,
                  i.formulaire_type                                                AS type_formulaire,
                  COALESCE(r.usager_nom, i.demandeur)                             AS usager_nom,
                  i.date_creation                                                  AS "dateA",
                  CASE WHEN r.id IS NULL THEN 'import' ELSE 'reponse-created' END AS source,
                  i.item_id                                                        AS item_id
             FROM tbl_items i
             LEFT JOIN tbl_reponses r ON r.item_id_cree = i.item_id
            WHERE i.${col} = $2
            ORDER BY "dateA" DESC
            LIMIT $1`,
          [limit, statut_value]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total
             FROM tbl_items
            WHERE ${col} = $1`,
          [statut_value]
        )
      ]);
      return { count: countRows[0].total, reponses };
    }

    const [{ rows: reponses }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT id,
                type_formulaire,
                usager_nom,
                "dateA",
                'reponse'    AS source,
                NULL::int    AS item_id
           FROM tbl_reponses
          WHERE item_id_cree IS NULL
            AND (statut_approbation IS NULL OR statut_approbation != 'item_supprime')

         UNION ALL

         SELECT COALESCE(r.id, i.item_id)                                     AS id,
                i.formulaire_type                                              AS type_formulaire,
                COALESCE(r.usager_nom, i.demandeur)                           AS usager_nom,
                i.date_creation                                                AS "dateA",
                CASE WHEN r.id IS NULL THEN 'import' ELSE 'reponse-created' END AS source,
                i.item_id                                                      AS item_id
           FROM tbl_items i
           LEFT JOIN tbl_reponses r ON r.item_id_cree = i.item_id
          WHERE (i.statut_bibliotheque IS NULL
             OR i.statut_bibliotheque = ''
             OR i.statut_bibliotheque = 'Saisie en cours - En attente')

          ORDER BY "dateA" DESC
          LIMIT $1`,
        [limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM (
           SELECT id FROM tbl_reponses WHERE item_id_cree IS NULL
             AND (statut_approbation IS NULL OR statut_approbation != 'item_supprime')
           UNION ALL
           SELECT item_id FROM tbl_items
            WHERE (statut_bibliotheque IS NULL
               OR statut_bibliotheque = ''
               OR statut_bibliotheque = 'Saisie en cours - En attente')
         ) sub`
      )
    ]);
    return { count: countRows[0].total, reponses };
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_reponses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async updateReponses(id, reponses) {
    const { rowCount } = await pool.query(
      `UPDATE tbl_reponses
          SET reponses = $2
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM tbl_items
             WHERE tbl_items.item_id = tbl_reponses.item_id_cree
               AND tbl_items.statut_bibliotheque = 'Soumettre aux ACQ'
          )`,
      [id, JSON.stringify(reponses)]
    );
    return rowCount > 0;
  },

  async deleteById(id) {
    const { rowCount } = await pool.query(
      `DELETE FROM tbl_reponses
        WHERE id = $1
          AND (statut_approbation IS NULL OR statut_approbation NOT IN ('approuve', 'refuse'))
          AND NOT EXISTS (
            SELECT 1 FROM tbl_items
             WHERE tbl_items.item_id = tbl_reponses.item_id_cree
               AND tbl_items.statut_bibliotheque = 'Soumettre aux ACQ'
          )`,
      [id]
    );
    return rowCount > 0;
  },

  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.id)
                r.id,
                r.type_formulaire,
                r."dateA",
                r.statut_approbation,
                r.commentaire_admin,
                -- r.date_traitement n'est renseigné que lors de l'étape d'approbation
                -- initiale (approuve/refuse) ; la plupart des demandes matérialisées
                -- passent directement en traitement ACQ sans jamais passer par cette
                -- étape. On retombe alors sur la date de la décision ACQ (date de
                -- dernière modification de l'item, une fois que celle-ci a un suivi
                -- ou un statut ACQ) pour que "Date de traitement" reflète la vraie
                -- date à laquelle la demande a été traitée par les ACQ.
                COALESCE(
                  r.date_traitement,
                  CASE WHEN i.suivi_acq IS NOT NULL OR i.statut_acq IS NOT NULL
                       THEN i.date_modification END
                ) AS date_traitement,
                r.usager_statut,
                COALESCE(i.titre_document,
                         r.reponses->>'titre_document',
                         r.reponses->'baseData'->>'titre_document')   AS titre_document,
                COALESCE(i.isbn_issn,
                         r.reponses->>'isbn_issn',
                         r.reponses->'baseData'->>'isbn_issn')         AS isbn_issn,
                COALESCE(i.editeur,
                         r.reponses->>'editeur',
                         r.reponses->'baseData'->>'editeur')           AS editeur,
                COALESCE(i.bibliotheque,
                         r.reponses->>'bibliotheque',
                         r.reponses->'baseData'->>'bibliotheque')      AS bibliotheque,
                COALESCE(i.prix_cad::text,
                         r.reponses->>'prix_cad',
                         r.reponses->'baseData'->>'prix_cad')          AS prix_cad,
                COALESCE(i.devise_originale,
                         r.reponses->>'devise_originale',
                         r.reponses->'baseData'->>'devise_originale')  AS devise_originale,
                COALESCE(i.statut_bibliotheque,
                         r.reponses->>'statut_bibliotheque',
                         r.reponses->'baseData'->>'statut_bibliotheque') AS statut_bibliotheque,
                i.suivi_acq,
                i.statut_acq,
                i.note_acq,
                i.note_commentaire
           FROM tbl_reponses r
           LEFT JOIN tbl_items i ON i.item_id = r.item_id_cree
          WHERE r.usager_courriel = $1
          ORDER BY r.id
       ) sub
       ORDER BY "dateA" DESC`,
      [email]
    );
    return rows;
  },

  // ── Toutes les demandes du système, en lecture seule (profil Usager — transparence) ──
  // Volontairement plus restreint que findByEmail : aucune information personnelle sur
  // le demandeur (nom, courriel), aucun champ financier ni note interne — seulement de
  // quoi identifier la demande et sa progression.
  async findAllPublic({ limit = 25, offset = 0, search = null, type_formulaire = null, bibliotheque = null, dateDebut = null, dateFin = null, statut = null } = {}) {
    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`titre_document ILIKE $${params.length}`);
    }
    if (type_formulaire) {
      params.push(type_formulaire);
      conditions.push(`type_formulaire = $${params.length}`);
    }
    if (bibliotheque) {
      params.push(bibliotheque);
      conditions.push(`bibliotheque = $${params.length}`);
    }
    if (dateDebut) {
      params.push(dateDebut);
      conditions.push(`"dateA" >= $${params.length}`);
    }
    if (dateFin) {
      params.push(dateFin);
      conditions.push(`"dateA"::date <= $${params.length}`);
    }
    // Même catégorisation que demandeBadgeStatut() côté front (lib/DemandeStatut.ts) :
    // 'attente' = pas encore soumise aux ACQ, 'soumise' = soumise, décision ACQ en attente,
    // 'traitee' = soumise et déjà traitée par les ACQ (suivi_acq renseigné).
    if (statut === 'attente') {
      conditions.push(`(statut_bibliotheque IS DISTINCT FROM 'Soumettre aux ACQ')`);
    } else if (statut === 'soumise') {
      conditions.push(`(statut_bibliotheque = 'Soumettre aux ACQ' AND suivi_acq IS NULL)`);
    } else if (statut === 'traitee') {
      conditions.push(`(statut_bibliotheque = 'Soumettre aux ACQ' AND suivi_acq IS NOT NULL)`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM (
         SELECT DISTINCT ON (r.id)
                r.id,
                r.type_formulaire,
                r."dateA",
                COALESCE(i.titre_document, r.reponses->>'titre_document', r.reponses->'baseData'->>'titre_document') AS titre_document,
                COALESCE(i.bibliotheque,   r.reponses->>'bibliotheque',   r.reponses->'baseData'->>'bibliotheque')   AS bibliotheque,
                COALESCE(i.statut_bibliotheque, r.reponses->>'statut_bibliotheque', r.reponses->'baseData'->>'statut_bibliotheque') AS statut_bibliotheque,
                i.suivi_acq,
                i.statut_acq
           FROM tbl_reponses r
           LEFT JOIN tbl_items i ON i.item_id = r.item_id_cree
      ) sub
      ${where}`;

    const dataParams = [...params, limit, offset];
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT * ${baseQuery} ORDER BY "dateA" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      pool.query(`SELECT COUNT(*) AS total ${baseQuery}`, params)
    ]);

    return { data: rows, total: parseInt(countRows[0].total, 10) };
  }
};

module.exports = ReponsesModel;