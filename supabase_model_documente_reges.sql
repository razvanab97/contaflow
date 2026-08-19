-- Adaugă secțiunea "Registru angajați (REGES)" la Model documente — extinde constrângerile
-- existente pe `sectiune` ca să accepte și noua valoare.
alter table model_documente drop constraint if exists model_documente_sectiune_check;
alter table model_documente add constraint model_documente_sectiune_check
  check (sectiune in ('raport_lunar','stat_plata_angajati','reges_angajati','acte_contabile'));

alter table model_documente_notite drop constraint if exists model_documente_notite_sectiune_check;
alter table model_documente_notite add constraint model_documente_notite_sectiune_check
  check (sectiune in ('raport_lunar','stat_plata_angajati','reges_angajati','acte_contabile'));
