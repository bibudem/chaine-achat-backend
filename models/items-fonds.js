/* ──────────────────────────────────────────────────────────────────────
   DDL — à exécuter une seule fois en base : voir sql/items_fonds.sql

   tbl_items.fonds_budgetaire reste le fonds principal (premier de la liste) ;
   cette table n'est peuplée que s'il y a un vrai partage (2 fonds ou plus).
   ────────────────────────────────────────────────────────────────────── */

const pool = require('../config/postgres.config');

/**
 * Remplace la répartition d'un item par la liste fournie (delete + insert),
 * dans la transaction du client fourni (appelé au sein d'une insertion/mise
 * à jour d'item — voir models/reponses.js et controllers/items.js).
 *
 * Ne fait rien de plus qu'un DELETE si `repartition` a 0 ou 1 entrée : le
 * partage n'a de sens qu'à partir de 2 fonds, fonds_budgetaire (tbl_items)
 * reste alors la seule source de vérité.
 */
async function remplacerRepartition(client, itemId, repartition) {
  await client.query('DELETE FROM tbl_items_fonds WHERE item_id = $1', [itemId]);

  const lignes = (repartition || []).filter(l => l && l.fonds_budgetaire && l.pourcentage > 0);
  if (lignes.length < 2) return;

  const valeurs = [];
  const placeholders = lignes.map((l, i) => {
    const base = i * 7;
    valeurs.push(itemId, l.devise_originale, l.prix_devise_originale, l.prix_cad, l.fonds_budgetaire, l.pourcentage, i);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });

  await client.query(
    `INSERT INTO tbl_items_fonds
       (item_id, devise_originale, prix_devise_originale, prix_cad, fonds_budgetaire, pourcentage, ordre)
     VALUES ${placeholders.join(', ')}`,
    valeurs
  );
}

async function getRepartition(itemId) {
  const { rows } = await pool.query(
    `SELECT fonds_id, devise_originale, prix_devise_originale, prix_cad, fonds_budgetaire, pourcentage
       FROM tbl_items_fonds
      WHERE item_id = $1
      ORDER BY ordre`,
    [itemId]
  );
  return rows;
}

module.exports = { remplacerRepartition, getRepartition };
