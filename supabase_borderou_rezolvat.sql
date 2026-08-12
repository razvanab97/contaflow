-- Marcaj manual "am facut factura" per rezervare, pentru cazurile in care verificarea automata
-- nu a gasit potrivirea dar utilizatorul stie ca factura chiar exista.
alter table borderou_rezervari add column if not exists rezolvat_client boolean not null default false;
alter table borderou_rezervari add column if not exists rezolvat_comision boolean not null default false;
