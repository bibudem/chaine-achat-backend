-- ═══════════════════════════════════════════════════════════════════════
-- Élargissement de tbl_items.devise_originale
--
-- Uniformisation du champ Informations financières (formulaires usager +
-- admin) : l'option "Autre" du menu déroulant des devises permet désormais
-- de préciser le nom de la devise en texte libre (ex. "Réal brésilien"),
-- envoyé tel quel comme valeur de devise_originale — la colonne était
-- limitée à VARCHAR(10) (juste assez pour un code ISO comme "CAD"/"USD"),
-- ce qui aurait rejeté toute précision de plus de 10 caractères avec une
-- erreur PostgreSQL "value too long for type character varying(10)".
--
-- Élargissement pur (aucune perte de données, aucune valeur existante ne
-- dépasse 3 caractères au moment de l'écriture) — sûr à exécuter en tout
-- temps, y compris avec des données existantes.
--
-- À exécuter une seule fois sur chaque environnement (dev déjà fait,
-- reste à appliquer sur les environnements de test/production).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tbl_items
  ALTER COLUMN devise_originale TYPE VARCHAR(100);
