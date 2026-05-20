const pool = require('../config/postgres.config');

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
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
          r.format_electronique || null,                     // $10
          r.acces_electronique  || null,                     // $11
          r.source_information  || null,                     // $12
          r.bibliotheque        || null,                     // $13
          reponse.usager_nom    || null,                     // $14
          r.note_commentaire    || null,                     // $15
          'En attente en bibliothèque',                      // $16
          'En attente'                                       // $17
        ]
      );
      const itemId = rows[0].item_id;

      // 2. tbl_suggestion_achat
      await client.query(
        `INSERT INTO tbl_suggestion_achat (
          item_id, auteur, usager_statut, usager_faculte, usager_courriel,
          bibliothecaire_disciplinaire, aviser_reservation, aviser_reception, date_requise_cours
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (item_id) DO UPDATE SET
          auteur                       = EXCLUDED.auteur,
          bibliothecaire_disciplinaire = EXCLUDED.bibliothecaire_disciplinaire,
          aviser_reservation           = EXCLUDED.aviser_reservation,
          aviser_reception             = EXCLUDED.aviser_reception,
          date_requise_cours           = EXCLUDED.date_requise_cours`,
        [
          itemId,
          r.auteur                         || null,
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

  async findAll({ type = null, statut = null, limit = 20, offset = 0 }) {
    const params     = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`type_formulaire = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`statut_approbation = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT id, type_formulaire, usager_nom, usager_courriel,
              usager_statut, reponses, "dateA",
              statut_approbation, courriel_admin,
              date_traitement, commentaire_admin,
              COUNT(*) OVER() AS total_count
       FROM tbl_reponses
       ${where}
       ORDER BY "dateA" DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    return {
      rows,
      total: rows.length ? parseInt(rows[0].total_count) : 0
    };
  },

  async getPending(limit = 5) {
    const [{ rows: reponses }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT id, type_formulaire, usager_nom, "dateA"
           FROM tbl_reponses
          WHERE item_id_cree IS NULL
          ORDER BY "dateA" DESC
          LIMIT $1`,
        [limit]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM tbl_reponses WHERE item_id_cree IS NULL`)
    ]);
    return { count: countRows[0].total, reponses };
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_reponses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
};

module.exports = ReponsesModel;