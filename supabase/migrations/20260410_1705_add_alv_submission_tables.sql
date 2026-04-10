create table if not exists ppr_alv_submissions (
  id uuid primary key default gen_random_uuid(),
  organisaatio_id uuid not null references ppr_organisaatiot(id) on delete cascade,
  asiakas_id uuid not null references ppr_kirjanpitoasiakkaat(id) on delete cascade,
  period_yyyy_mm text not null,
  period_start date not null,
  period_end date not null,
  kausi_tyyppi text not null default '1kk',
  status text not null default 'prepared',
  totals jsonb not null default '{}'::jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  response_json jsonb null,
  error_code text null,
  error_message text null,
  created_by_kayttaja_id uuid null references ppr_kayttajat(id),
  approved_by_kayttaja_id uuid null references ppr_kayttajat(id),
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ppr_alv_submissions_asiakas_period
  on ppr_alv_submissions (asiakas_id, period_yyyy_mm, created_at desc);

create table if not exists ppr_alv_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ppr_alv_submissions(id) on delete cascade,
  event_type text not null,
  message text null,
  payload_json jsonb null,
  created_by_kayttaja_id uuid null references ppr_kayttajat(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ppr_alv_submission_events_submission
  on ppr_alv_submission_events (submission_id, created_at desc);

