const pool = require('../config/postgres.config');

// Journal des courriels (table tbl_courriels) : une ligne par courriel. Un appel à n8n
// (envoi_ref) peut produire plusieurs courriels (ex. BAL ACQ + accusé de réception) : la
// première ligne est créée à l'appel, n8n renvoie ensuite le statut de chaque courriel
// (route POST /courriels/retour) — la ligne correspondante est mise à jour, ou ajoutée.

// Rôle affiché selon le nœud d'envoi du workflow n8n.
const ROLES_NOEUD = {
  'Envoyer email — Admin':               'BAL ACQ',
  'Envoyer email — Confirmation Usager': 'Accusé de réception',
  'Envoyer email — Usager':              'Usager',
  'Envoyer email — TechDoc':             'Équipe TechDoc',
  'Envoyer email — TDM':                 'BAL TDM',
  'Envoyer email — Équipe tri':          'Équipe de tri',
};

const STATUTS = ['transmis', 'envoye', 'echec'];

const CourrielsModel = {

  /** Ligne créée au moment de l'appel à n8n (statut « transmis »). */
  async creer({ envoi_ref, type_envoi, item_id = null, reponse_id = null, destinataire = null,
                role_destinataire = null, noeud = null, contenu = null,
                declenche_par = null, declenche_par_nom = null }) {
    const { rows } = await pool.query(
      `INSERT INTO tbl_courriels
         (envoi_ref, type_envoi, item_id, reponse_id, destinataire, role_destinataire, noeud,
          contenu, declenche_par, declenche_par_nom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING courriel_id`,
      [envoi_ref, type_envoi, item_id, reponse_id, destinataire, role_destinataire, noeud,
       contenu ? JSON.stringify(contenu) : null, declenche_par, declenche_par_nom]
    );
    return rows[0].courriel_id;
  },

  /** n8n non joignable : tout l'envoi est en échec. */
  async marquerEchecEnvoi(envoi_ref, erreur) {
    await pool.query(
      `UPDATE tbl_courriels SET statut = 'echec', erreur = $2, date_maj = CURRENT_TIMESTAMP
        WHERE envoi_ref = $1 AND statut = 'transmis'`,
      [envoi_ref, erreur]
    );
  },

  /** Retour de n8n pour un courriel : met à jour la ligne du même nœud, sinon la ligne encore
   *  sans nœud ; à défaut, ajoute une ligne (envoi à plusieurs destinataires). */
  async enregistrerRetour({ envoi_ref, noeud, statut, destinataire, erreur }) {
    if (!STATUTS.includes(statut)) throw new Error('Statut invalide');
    const role = ROLES_NOEUD[noeud] || null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM tbl_courriels WHERE envoi_ref = $1 ORDER BY courriel_id FOR UPDATE`,
        [envoi_ref]
      );
      if (!rows.length) { await client.query('ROLLBACK'); return false; }

      const cible = rows.find(r => r.noeud === noeud && r.statut === 'transmis')
                 || rows.find(r => !r.noeud && r.statut === 'transmis');
      if (cible) {
        await client.query(
          `UPDATE tbl_courriels
              SET noeud = $2, statut = $3, erreur = $4,
                  destinataire = COALESCE(NULLIF($5, ''), destinataire),
                  role_destinataire = COALESCE(role_destinataire, $6),
                  date_maj = CURRENT_TIMESTAMP
            WHERE courriel_id = $1`,
          [cible.courriel_id, noeud, statut, erreur || null, destinataire || '', role]
        );
      } else {
        const base = rows[0];
        await client.query(
          `INSERT INTO tbl_courriels
             (envoi_ref, type_envoi, item_id, reponse_id, destinataire, role_destinataire, noeud,
              contenu, declenche_par, declenche_par_nom, statut, erreur, date_maj)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
          [envoi_ref, base.type_envoi, base.item_id, base.reponse_id, destinataire || null, role,
           noeud, base.contenu, base.declenche_par, base.declenche_par_nom, statut, erreur || null]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** Liste paginée (Registres → Courriels envoyés). */
  async lister({ q = '', type = '', statut = '', du = '', au = '', limit = 25, offset = 0 }) {
    const conditions = [];
    const params = [];
    const recherche = q.trim();
    const parId = /^#\s*(\d+)$/.exec(recherche);
    if (parId) {
      params.push(parseInt(parId[1], 10));
      conditions.push(`c.item_id = $${params.length}`);
    } else if (recherche) {
      params.push(`%${recherche}%`);
      const i = params.length;
      conditions.push(`(c.destinataire ILIKE $${i} OR i.titre_document ILIKE $${i} OR c.declenche_par_nom ILIKE $${i})`);
    }
    if (type)   { params.push(type);   conditions.push(`c.type_envoi = $${params.length}`); }
    if (statut && STATUTS.includes(statut)) { params.push(statut); conditions.push(`c.statut = $${params.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(du)) { params.push(du); conditions.push(`c.date_creation >= $${params.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(au)) { params.push(au); conditions.push(`c.date_creation < $${params.length}::date + 1`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from  = `FROM tbl_courriels c LEFT JOIN tbl_items i ON i.item_id = c.item_id ${where}`;
    const [{ rows }, { rows: total }] = await Promise.all([
      pool.query(
        `SELECT c.*, i.titre_document ${from}
          ORDER BY c.date_creation DESC, c.courriel_id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n ${from}`, params),
    ]);
    return { data: rows, total: total[0].n };
  },

  /** Courriels d'une demande : ceux de l'item et ceux de sa réponse d'origine (envoyés avant
   *  la création de l'item, ex. accusé de réception d'une suggestion publique). */
  async parItem(itemId) {
    const { rows } = await pool.query(
      `SELECT c.* FROM tbl_courriels c
        WHERE c.item_id = $1
           OR c.reponse_id IN (SELECT id FROM tbl_reponses WHERE item_id_cree = $1)
        ORDER BY c.date_creation DESC, c.courriel_id DESC`,
      [itemId]
    );
    return rows;
  },
};

module.exports = CourrielsModel;
