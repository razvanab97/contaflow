-- "documente.tip_document" e doar o eticheta de afisare/filtrare, nu o cheie straina — dar are o
-- constrangere CHECK invechita care nu cunoaste valorile noi generate de AI (pontaj, centralizator etc).
-- O eliminam ca sa nu mai blocheze incarcari viitoare de orice tip nou de document.
alter table documente drop constraint if exists documente_tip_document_check;
