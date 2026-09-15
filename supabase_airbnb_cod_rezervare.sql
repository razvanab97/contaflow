-- Codul de rezervare Airbnb e scris explicit în textul facturii de comision
-- ("Taxe de utilizare a platformei online pentru rezervarea XXXXXXXXXX") —
-- e un semnal de potrivire mult mai sigur decât suma (care poate diferi cu
-- câțiva bani față de taxa_servicii din borderoul CSV, din rotunjire).

alter table documente add column if not exists cod_rezervare_airbnb text;
create index if not exists documente_cod_rezervare_airbnb_idx on documente(firma_id, luna_id, cod_rezervare_airbnb);
