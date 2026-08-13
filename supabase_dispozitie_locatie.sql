-- Locatie (apartament/adresa) si utilitate (URBICA, asociatie, E.ON curent, gaz etc.) structurate
-- pentru dispozitiile de plata si facturile atasate, ca sa poata fi afisate direct in denumire.
-- Coloana `suma` exista deja pe `documente`, doar o populam acum pentru aceste randuri.
alter table documente add column if not exists locatie text;
alter table documente add column if not exists utilitate text;
