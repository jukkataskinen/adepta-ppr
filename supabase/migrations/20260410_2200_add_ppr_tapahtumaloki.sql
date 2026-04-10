-- Kevyt audit-/tapahtumaloki (kirjanpito, lukot, myöhemmin laajennettavissa)
create table if not exists ppr_tapahtumaloki (
  id uuid primary key default gen_random_uuid(),
  organisaatio_id uuid not null references ppr_organisaatiot(id) on delete cascade,
  asiakas_id uuid null references ppr_kirjanpitoasiakkaat(id) on delete set null,
  kayttaja_id uuid null references ppr_kayttajat(id) on delete set null,
  tyyppi text not null,
  viesti text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ppr_tapahtumaloki_org_aika
  on ppr_tapahtumaloki (organisaatio_id, created_at desc);

comment on table ppr_tapahtumaloki is
  'Palvelinpuolen tapahtumat (lukot, kriittiset muutokset). RLS: vain service role / admin.';
