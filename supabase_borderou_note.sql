-- Nota optionala atasata la marcarea "Am facturat" (client) / rezolvarea comisionului, pe rezervarile
-- din borderou - ex. "luna trecuta", "trebuie facturat la jumatate" - pastrata pentru referinta,
-- separat pentru cele doua fluxuri (client vs comision) la fel cum sunt separate si flag-urile
-- rezolvat_client / rezolvat_comision.
alter table borderou_rezervari add column if not exists nota_client text;
alter table borderou_rezervari add column if not exists nota_comision text;
