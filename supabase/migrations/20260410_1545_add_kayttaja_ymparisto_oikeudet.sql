alter table if exists ppr_kayttajat
  add column if not exists sallitut_kirjanpitoasiakas_ids uuid[] null;

comment on column ppr_kayttajat.sallitut_kirjanpitoasiakas_ids is
  'Kirjanpitajan sallitut kirjanpitoymparistot (ppr_kirjanpitoasiakkaat.id). Null/tyhja = vanha fallback-oikeuslogiikka.';

