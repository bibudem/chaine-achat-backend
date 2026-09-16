-- ═══════════════════════════════════════════════════════════════════════
-- Historique des taux de change par période
--
-- Une ligne = une période (ex. "2025-2026"), avec les taux de toutes les
-- devises en vigueur pour cette période regroupés dans une seule colonne
-- JSONB (ex. { "USD": 1.368, "EUR": 1.48 }). Ceci reflète l'usage réel :
-- WMS publie une nouvelle grille de taux par période, pas un taux par
-- devise indépendamment les unes des autres — voir models/taux-devises.js
-- pour les opérations d'ajout/modification/suppression d'une devise au
-- sein d'une période (fusion/retrait de clé dans le JSONB, sans toucher
-- aux autres devises de la même ligne).
--
-- À exécuter une seule fois sur chaque environnement.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tbl_taux_devises_historique (
  id             SERIAL PRIMARY KEY,
  periode        VARCHAR(50)   NOT NULL,
  date_debut     DATE          NOT NULL DEFAULT CURRENT_DATE,
  taux           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  note           VARCHAR(255)  NULL,
  date_creation  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  cree_par       VARCHAR(255)  NULL,
  date_modif     TIMESTAMPTZ   NULL,
  modifie_par    VARCHAR(255)  NULL
);

CREATE INDEX IF NOT EXISTS idx_taux_devises_date_debut ON tbl_taux_devises_historique (date_debut DESC);
