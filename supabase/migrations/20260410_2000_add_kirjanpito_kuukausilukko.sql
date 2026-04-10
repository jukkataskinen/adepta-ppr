-- Kirjanpitokuukauden lukitus (ei uusia kirjauksia ellei avata)
create table if not exists ppr_kirjanpito_kuukausilukot (
  id uuid primary key default gen_random_uuid(),
  asiakas_id uuid not null references ppr_kirjanpitoasiakkaat(id) on delete cascade,
  yyyy_mm text not null,
  lukittu_at timestamptz not null default now(),
  lukitsija_kayttaja_id uuid null references ppr_kayttajat(id),
  unique(asiakas_id, yyyy_mm)
);

create index if not exists idx_kk_lukko_asiakas on ppr_kirjanpito_kuukausilukot (asiakas_id);

comment on table ppr_kirjanpito_kuukausilukot is
  'Lukitut kuukaudet: ppr_paivakirja-kirjauksia ei sallita lukitulle kuukaudelle.';
