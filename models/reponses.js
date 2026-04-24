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
        "Suggestion d'achat",
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
          formulaire_type, priorite_demande,
          titre_document, isbn_issn, editeur, date_publication,
          categorie_document, format_support, source_information,
          bibliotheque, demandeur,
          note_commentaire, statut_bibliotheque
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING item_id`,
        [
          "Suggestion d'achat",
          r.priorite_demande   || 'Urgent',
          r.titre_document     || null,
          r.isbn_issn          || null,
          r.editeur            || null,
          r.date_publication   || null,
          r.categorie_document || null,
          r.format_support     || null,
          r.source_information || null,
          r.bibliotheque       || null,
          reponse.usager_nom,
          r.note_commentaire   || null,
          'En attente en bibliothèque'
        ]
      );
      const itemId = rows[0].item_id;

      // 2. tbl_suggestion_achat
      await client.query(
        `INSERT INTO tbl_suggestion_achat (
          item_id, auteur, usager_statut, usager_faculte, usager_courriel,
          bibliothecaire_disciplinaire, aviser_reservation, aviser_reception, date_requise_cours
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
           VALUES ($1, true, $2)`,
          [itemId, r.reserve_cours_sigle || null]
        );
      }

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

      const b = reponse.reponses?.baseData     || {};
      const s = reponse.reponses?.specificData || {};

      // 1. tbl_items
      const { rows } = await client.query(
        `INSERT INTO tbl_items (
          formulaire_type, date_creation, priorite_demande,
          titre_document, sous_titre, isbn_issn, editeur,
          date_publication, source_information, categorie_document,
          format_support, format_pret_numerique, nombre_utilisateurs,
          lien_plateforme, nombre_titres_inclus, periode_couverte,
          prix_cad, devise_originale, prix_devise_originale,
          fonds_budgetaire, fonds_sn_projet, fournisseur,
          bibliotheque, localisation_emplacement, demandeur,
          personne_a_aviser_activation, projet_special,
          statut_bibliotheque, statut_acq, note_commentaire,
          id_ressource, catalogue, creation_notice_dtdm,
          note_dtdm, utilisateur_modification, date_modification
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,NOW()
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
          b.format_pret_numerique        || null,                                   // $12
          b.nombre_utilisateurs          || null,                                   // $13
          b.lien_plateforme              || null,                                   // $14
          b.nombre_titres_inclus         || null,                                   // $15
          b.periode_couverte             || null,                                   // $16
          b.prix_cad                     || null,                                   // $17
          b.devise_originale             || null,                                   // $18
          b.prix_devise_originale        || null,                                   // $19
          b.fonds_budgetaire             || null,                                   // $20
          b.fonds_sn_projet              || null,                                   // $21
          b.fournisseur                  || null,                                   // $22
          b.bibliotheque                 || null,                                   // $23
          b.localisation_emplacement     || null,                                   // $24
          reponse.usager_nom             || b.demandeur         || null,            // $25
          b.personne_a_aviser_activation || reponse.usager_courriel || null,        // $26
          b.projet_special               || null,                                   // $27
          'Soumis aux ACQ : Formulaire complété et prêt à être transmis aux Acquisitions.', // $28
          'En attente de traitement aux ACQ',                                       // $29
          b.note_commentaire             || null,                                   // $30
          b.id_ressource                 || null,                                   // $31
          b.catalogue                    || null,                                   // $32
          b.creation_notice_dtdm === true || b.creation_notice_dtdm === 'true',    // $33
          b.note_dtdm                    || null,                                   // $34
          reponse.usager_nom             || null                                    // $35
        ]
      );
      const itemId = rows[0].item_id;

      // 2. tbl_nouvel_achat_unique
      await client.query(
        `INSERT INTO tbl_nouvel_achat_unique (
          item_id, projets_speciaux, type_monographie, format_electronique,
          reserve_cours, reserve_cours_sigle, reserve_cours_session,
          reserve_cours_enseignant, bordereau_imprime
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (item_id) DO UPDATE SET
          type_monographie         = EXCLUDED.type_monographie,
          format_electronique      = EXCLUDED.format_electronique,
          reserve_cours            = EXCLUDED.reserve_cours,
          reserve_cours_sigle      = EXCLUDED.reserve_cours_sigle,
          reserve_cours_session    = EXCLUDED.reserve_cours_session,
          reserve_cours_enseignant = EXCLUDED.reserve_cours_enseignant`,
        [
          itemId,
          s.projets_speciaux                                   || null,  // $2
          s.type_monographie                                   || null,  // $3
          s.format_electronique                                || null,  // $4
          s.reserve_cours === true || s.reserve_cours === 'true',        // $5
          s.reserve_cours ? (s.reserve_cours_sigle      || null) : null, // $6
          s.reserve_cours ? (s.reserve_cours_session    || null) : null, // $7
          s.reserve_cours ? (s.reserve_cours_enseignant || null) : null, // $8
          s.bordereau_imprime                                  || null   // $9
        ]
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

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM tbl_reponses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
};

module.exports = ReponsesModel;