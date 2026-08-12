-- Coloană separată pentru notele de status pe tranzacții (ex: "Aștept factura")
-- Independentă de coloana `note`, care rămâne dedicată exclusiv flagului N/A ('na')
-- Fără asta, marcarea N/A (butonul "Sari") suprascria notele de status.

alter table tranzactii add column if not exists status_note text;
