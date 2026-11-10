const pool = require('../config/postgres.config');
const PiecesJointesModel = require('./pieces-jointes');
const ItemsFondsModel = require('./items-fonds');
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
  'acq_raison_annulation', 'techdoc_suggestion_transmise', 'techdoc_tri_notes', 'acq_isbn',
  'acq_responsable_courriel', 'courriel_tierce_personne', 'type_document', 'edition',
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

  // ── Suggestion publique (formulaire /suggestion-public, communauté UdeM) ──────
  // Même type de formulaire qu'une suggestion interne, mais entre dans la file de tri de
  // l'équipe TechDoc (tri_statut = 'a_trier') au lieu d'aller directement vers les ACQ.
  async createSuggestionPublique({ usager_nom, usager_courriel, usager_statut, reponses }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_reponses
         (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses, tri_statut)
       VALUES ($1, $2, $3, $4, $5, 'a_trier')
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

  // ── Tri des suggestions publiques (équipe TechDoc) ────────────────────────────
  // Liste unique (plus d'onglets côté UI) couvrant tout le cycle de vie d'une suggestion
  // publique, triée par ordre de priorité : à trier d'abord (plus anciennes en premier —
  // premier arrivé, premier servi), puis triées mais pas encore soumises (à compléter), puis
  // soumises aux ACQ (plus récente décision en premier dans chaque groupe).
  // La décision de tri (Oui/Non) est un AVIS de l'équipe TechDoc : la décision finale revient
  // aux ACQ. Une suggestion refusée se complète et se soumet donc comme une acceptée — d'où
  // 'a_completer'/'soumise' sur les deux décisions ; 'refuse' filtre l'avis lui-même.
  // `statut` filtre sur l'une de ces quatre catégories ; sans lui, tout le cycle est retourné.
  // `ordre` ('date_desc' | 'date_asc') remplace cet ordre par un tri sur la date affichée
  // (date du tri, ou date de réception pour une suggestion pas encore triée).
  async findTri({ statut = null, search = null, ordre = null, limit = 20, offset = 0 } = {}) {
    const params     = [];
    const conditions = [`r.tri_statut IN ('a_trier', 'accepte', 'refuse')`];
    const trieeSql      = `r.tri_statut IN ('accepte', 'refuse')`;
    const nonSoumiseSql = `COALESCE(i.statut_bibliotheque, r.reponses->>'statut_bibliotheque') IS DISTINCT FROM 'Soumettre aux ACQ'`;
    const soumiseSql    = `COALESCE(i.statut_bibliotheque, r.reponses->>'statut_bibliotheque') = 'Soumettre aux ACQ'`;

    if (statut === 'a_trier') {
      conditions.push(`r.tri_statut = 'a_trier'`);
    } else if (statut === 'refuse') {
      conditions.push(`r.tri_statut = 'refuse'`);
    } else if (statut === 'a_completer') {
      conditions.push(`${trieeSql} AND ${nonSoumiseSql}`);
    } else if (statut === 'soumise') {
      conditions.push(`${trieeSql} AND ${soumiseSql}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(r.reponses->>'titre_document' ILIKE $${params.length}
                     OR r.usager_nom      ILIKE $${params.length}
                     OR r.usager_courriel ILIKE $${params.length}
                     OR r.reponses->>'courriel_tierce_personne' ILIKE $${params.length})`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    // Priorité : 0 = à trier, 1 = triée (acceptée ou refusée) à compléter, 2 = soumise aux ACQ.
    const priorite = `CASE
         WHEN r.tri_statut = 'a_trier' THEN 0
         WHEN ${nonSoumiseSql} THEN 1
         ELSE 2
       END`;
    const dateAffichee = `COALESCE(r.tri_date, r."dateA")`;
    const orderBy = ordre === 'date_desc' ? `${dateAffichee} DESC, r.id DESC`
                  : ordre === 'date_asc'  ? `${dateAffichee} ASC, r.id ASC`
                  : `${priorite} ASC,
                 CASE WHEN r.tri_statut = 'a_trier' THEN r."dateA" END ASC,
                 CASE WHEN r.tri_statut != 'a_trier' THEN ${dateAffichee} END DESC`;
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT r.id, r."dateA", r.usager_nom, r.usager_courriel, r.usager_statut, r.reponses,
              r.tri_statut, r.tri_commentaire, r.tri_par, r.tri_par_nom, r.tri_date,
              r.item_id_cree,
              COALESCE(i.statut_bibliotheque, r.reponses->>'statut_bibliotheque') AS statut_bibliotheque,
              i.suivi_acq,
              i.statut_acq,
              i.note_acq,
              COUNT(*) OVER() AS total_count
         FROM tbl_reponses r
         LEFT JOIN tbl_items i ON i.item_id = r.item_id_cree
         ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    const total = rows.length ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(({ total_count, ...r }) => r), total };
  },

  async countATrier() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tbl_reponses WHERE tri_statut = 'a_trier'`
    );
    return rows[0].total;
  },

  // Décision de tri. La condition tri_statut = 'a_trier' rend l'opération atomique : si deux
  // membres de l'équipe décident en même temps, seul le premier l'emporte — le second reçoit
  // la décision déjà prise (voir le contrôleur, qui répond alors 409).
  // « Suggestion d'achat transmise en bibliothèque » : cochée automatiquement dès qu'une
  // décision (Oui ou Non) est rendue — plus de saisie manuelle.
  async decisionTri({ id, decision, commentaire, par, parNom, techdocTriNotes, majSuiviTri = true }) {
    const { rows } = await pool.query(
      `UPDATE tbl_reponses
          SET tri_statut      = $2,
              tri_commentaire = $3,
              tri_par         = $4,
              tri_par_nom     = $5,
              tri_date        = NOW(),
              -- Notes TechDoc : mises à jour seulement par l'équipe de tri ($7), sinon conservées.
              reponses        = reponses::jsonb
                                || jsonb_build_object('techdoc_suggestion_transmise', true)
                                || CASE WHEN $7::boolean THEN jsonb_build_object('techdoc_tri_notes', $6::text)
                                        ELSE '{}'::jsonb END
        WHERE id = $1
          AND tri_statut = 'a_trier'
        RETURNING id, usager_nom, usager_courriel, reponses, tri_statut, tri_commentaire, tri_par_nom, tri_date`,
      [id, decision, commentaire, par, parNom, techdocTriNotes || null, !!majSuiviTri]
    );
    if (rows[0]) return { updated: rows[0] };

    const { rows: existant } = await pool.query(
      `SELECT tri_statut, tri_par_nom, tri_date FROM tbl_reponses WHERE id = $1`,
      [id]
    );
    return { updated: null, existant: existant[0] || null };
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

  // ═══════════════════════════════════════════════════════════
  // COMMUN — lecture
  // ═══════════════════════════════════════════════════════════

  async findAll({ type = null, statut = null, suivi_acq = null, limit = 20, offset = 0 }) {
    const params     = [];
    // Suggestions publiques pas encore triées par l'équipe TechDoc ne concernent pas (ou pas
    // encore) les ACQ — voir findTri plus bas. Celles refusées au tri suivent le circuit comme
    // les acceptées : le refus est un avis, affiché aux ACQ qui prennent la décision finale.
    const conditions = [`(r.tri_statut IS NULL OR r.tri_statut IN ('accepte', 'refuse'))`];

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
              r.tri_statut, r.tri_commentaire, r.tri_par_nom, r.tri_date,
              i.suivi_acq,
              -- L'item lié (item_id_cree) peut avoir été supprimé de tbl_items sans que la
              -- réponse le sache : on remonte son existence réelle et son statut_bibliotheque
              -- pour que le frontend applique la même garde de suppression que le backend
              -- (ReponsesModel.deleteById) plutôt que de se fier au statut_bibliotheque figé
              -- sur la réponse elle-même.
              (i.item_id IS NOT NULL) AS item_existe,
              i.statut_bibliotheque   AS item_statut_bibliotheque,
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
      // Création de notice TDM, si le formulaire ne l'a pas fournie : Oui pour l'imprimé
      // (Imprimé/support physique, Imprimé et électronique), Non pour l'électronique — les ACQ
      // la passent à Oui au besoin. Même règle que l'affichage de la page de décision ACQ
      // (statut-decision.component.ts, applyAcqDefaults). Sans format (ex. Suggestion d'achat,
      // format saisi plus tard par les ACQ), on ne présume rien.
      if (cleanBase.creation_notice_dtdm == null && cleanBase.format_support) {
        cleanBase.creation_notice_dtdm = cleanBase.format_support !== 'Électronique';
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verrou sur la réponse : deux appels simultanés (double clic, matérialisation automatique
      // en même temps que POST /:id/creer-item) attendent ici ; le second voit item_id_cree
      // déjà renseigné et renvoie le même item au lieu d'en créer un deuxième.
      const { rows: verrou } = await client.query(
        'SELECT item_id_cree FROM tbl_reponses WHERE id = $1 FOR UPDATE', [reponseId]
      );
      if (verrou[0]?.item_id_cree) {
        await client.query('COMMIT');
        return verrou[0].item_id_cree;
      }

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

      // baseData.fonds_repartition n'est pas une colonne de tbl_items (filtré par
      // filterToTableColumns ci-dessus) — on la lit depuis baseData, pas safeBase.
      await ItemsFondsModel.remplacerRepartition(client, itemId, baseData.fonds_repartition);

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
      // Même logique que findAll ci-dessus : on remonte l'existence réelle et le
      // statut_bibliotheque de l'item lié, indépendamment du statut_bibliotheque figé sur la
      // réponse elle-même (voir commentaire dans findAll).
      `SELECT r.*,
              (i.item_id IS NOT NULL) AS item_existe,
              i.statut_bibliotheque   AS item_statut_bibliotheque
         FROM tbl_reponses r
         LEFT JOIN tbl_items i ON i.item_id = r.item_id_cree
        WHERE r.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // Commentaire de la décision de tri (pour les ACQ), modifiable depuis le formulaire de
  // complétion — voir patchReponses.
  async majTriCommentaire(id, commentaire) {
    await pool.query(
      `UPDATE tbl_reponses SET tri_commentaire = $2 WHERE id = $1 AND tri_statut IN ('accepte', 'refuse')`,
      [id, commentaire]
    );
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
          AND tri_statut IS DISTINCT FROM 'refuse'
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
                i.note_commentaire,
                -- Numéro affiché à l'usager = numéro de l'item (celui des demandes transmises).
                r.item_id_cree AS item_id,
                -- Précision de la demande (Modification et CCOL seulement).
                COALESCE((SELECT mc.precision_demande FROM tbl_modification_ccol mc
                           WHERE mc.item_id = r.item_id_cree LIMIT 1),
                         r.reponses->'specificData'->>'precision_demande') AS precision_demande
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

    // Suggestions publiques pas encore triées par l'équipe TechDoc : pas encore entrées dans
    // le circuit des demandes, voir findTri. Refusées au tri : simple avis, elles poursuivent
    // le circuit comme les acceptées (décision finale aux ACQ).
    conditions.push(`(tri_statut IS NULL OR tri_statut IN ('accepte', 'refuse'))`);

    const where = `WHERE ${conditions.join(' AND ')}`;

    const baseQuery = `
      FROM (
         SELECT DISTINCT ON (r.id)
                r.id,
                r.type_formulaire,
                r."dateA",
                r.tri_statut,
                COALESCE(i.titre_document, r.reponses->>'titre_document', r.reponses->'baseData'->>'titre_document') AS titre_document,
                COALESCE(i.bibliotheque,   r.reponses->>'bibliotheque',   r.reponses->'baseData'->>'bibliotheque')   AS bibliotheque,
                COALESCE(i.statut_bibliotheque, r.reponses->>'statut_bibliotheque', r.reponses->'baseData'->>'statut_bibliotheque') AS statut_bibliotheque,
                i.suivi_acq,
                i.statut_acq,
                -- Numéro affiché à l'usager = numéro de l'item (celui des demandes transmises).
                r.item_id_cree AS item_id,
                -- Précision de la demande (Modification et CCOL seulement).
                COALESCE((SELECT mc.precision_demande FROM tbl_modification_ccol mc
                           WHERE mc.item_id = r.item_id_cree LIMIT 1),
                         r.reponses->'specificData'->>'precision_demande') AS precision_demande
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