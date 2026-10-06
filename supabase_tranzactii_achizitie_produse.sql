-- Corectia manuala pentru categoria "Achizitii produse" (AB Homes Invest, Rezumatul lunii):
--   null  = automat (regula pe furnizori din lib/achizitii-produse.ts)
--   true  = marcata manual ca achizitie de produse (are prioritate fata de regula automata)
--   false = exclusa manual din achizitii de produse (are prioritate fata de regula automata)
-- Idempotent - se poate rula de mai multe ori. Fara aceasta coloana aplicatia functioneaza doar pe
-- regula automata; marcarea/eliminarea manuala cere migrarea.
alter table tranzactii add column if not exists achizitie_produse boolean;
