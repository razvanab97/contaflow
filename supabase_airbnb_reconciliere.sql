-- Reconciliere automată borderou Airbnb ↔ facturi Airbnb Ireland UC (taxă de servicii).
-- Potrivirea se face după suma exactă (taxa_servicii din borderou == suma facturii),
-- nu după suma totală a rezervării — facturile Airbnb Ireland UC sunt facturi de
-- comision, nu de valoare totală a sejurului. Coloanele de mai jos țin minte cum
-- s-a făcut asocierea, ca să poată fi deosebită de asocierea manuală/exactă pe cod.

alter table airbnb_facturi_asteptate add column if not exists asociere_scor numeric;
alter table airbnb_facturi_asteptate add column if not exists asociere_metoda text;
