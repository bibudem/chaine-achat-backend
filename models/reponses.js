const pool = require('../config/postgres.config');

const ReponsesModel = {

  async create({ type_formulaire, usager_nom, usager_courriel, usager_statut, reponses }) {
    const query = `
      INSERT INTO tbl_reponses
        (type_formulaire, usager_nom, usager_courriel, usager_statut, reponses)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, "dateA"
    `;
    const values = [
      type_formulaire,
      usager_nom,
      usager_courriel,
      usager_statut,
      JSON.stringify(reponses || {})
    ];
    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // ── Mise à jour statut après décision admin ──
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

  // ── INSERT dans tbl_items + tbl_suggestion_achat après approbation ──
  async insererApresApprobation(reponse) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = reponse.reponses || {};

      // 1. INSERT dans tbl_items (commun aux deux types)
      const itemResult = await client.query(
        `INSERT INTO tbl_items (
          formulaire_type,
          titre_document,
          isbn_issn,
          editeur,
          date_publication,
          categorie_document,
          demandeur,
          note_commentaire,
          statut_acq,
          source_information
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING item_id`,
        [
          reponse.type_formulaire,
          r.titre          || null,
          r.isbnIssn       || null,
          r.editeur        || null,
          r.annee          || null,
          r.typeDocument   || null,
          reponse.usager_nom,
          r.notes          || r.description || null,
          'approuve',
          reponse.usager_courriel
        ]
      );

      const itemId = itemResult.rows[0].item_id;

      // 2. INSERT dans la table spécialisée selon le type
      if (reponse.type_formulaire === 'suggestion') {
        await client.query(
          `INSERT INTO tbl_suggestion_achat
            (item_id, justification, recommandation)
           VALUES ($1, $2, $3)`,
          [
            itemId,
            r.notes         || null,
            r.reserver === 'oui'
          ]
        );

        // Si réserve de cours cochée → tbl_nouvel_achat_unique
        if (r.mettreReserve) {
          await client.query(
            `INSERT INTO tbl_nouvel_achat_unique
              (item_id, reserve_cours, reserve_cours_sigle)
             VALUES ($1, $2, $3)`,
            [itemId, true, r.sigleCours || null]
          );
        }

      } else {
        // type === 'demande' → tbl_nouvel_achat_unique
        await client.query(
          `INSERT INTO tbl_nouvel_achat_unique
            (item_id, type_monographie)
           VALUES ($1, $2)`,
          [itemId, r.typeDocument || null]
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

  async findAll({ type = null, statut = null, limit = 20, offset = 0 }) {
    const params = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`type_formulaire = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`statut_approbation = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(
      `SELECT id, type_formulaire, usager_nom, usager_courriel,
              usager_statut, reponses, "dateA",
              statut_approbation, courriel_admin,
              date_traitement, commentaire_admin,
              COUNT(*) OVER() AS total_count
       FROM tbl_reponses
       ${whereClause}
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