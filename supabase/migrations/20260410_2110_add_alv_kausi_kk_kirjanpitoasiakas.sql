-- ALV-ilmoitusjakson pituus kirjanpitoympäristön kantatiedoissa (1 / 3 / 12 kk)
alter table ppr_kirjanpitoasiakkaat
  add column if not exists alv_kausi_kk smallint not null default 1;

alter table ppr_kirjanpitoasiakkaat
  drop constraint if exists ppr_kirjanpitoasiakkaat_alv_kausi_kk_check;

alter table ppr_kirjanpitoasiakkaat
  add constraint ppr_kirjanpitoasiakkaat_alv_kausi_kk_check
  check (alv_kausi_kk in (1, 3, 12));

comment on column ppr_kirjanpitoasiakkaat.alv_kausi_kk is
  'ALV-tarkastelujakso: 1=kuukausi, 3=kalenterineljännes, 12=kalenterivuosi.';
