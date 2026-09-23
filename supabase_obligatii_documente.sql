-- Documentul efectiv atasat unei obligatii recurente (extras de cont, Reges, acte contabile etc.),
-- la fel ca la achizitii (documente.achizitie_id) - o obligatie poate avea mai multe documente
-- (ex. atat statul de plata cat si pontajul, pentru Reges).
alter table documente add column if not exists obligatie_stare_id uuid references obligatii_stari(id) on delete cascade;
create index if not exists documente_obligatie_stare_id_idx on documente(obligatie_stare_id) where obligatie_stare_id is not null;
