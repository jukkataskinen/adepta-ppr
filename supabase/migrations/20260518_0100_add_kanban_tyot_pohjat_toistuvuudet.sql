-- =====================================================
-- VAIHE 1: Kanban-toiminnanohjaus — tietomalli + RLS + seed
-- =====================================================

-- =====================================================
-- TYÖPOHJAT (jaettu kaikille asiakkaille)
-- =====================================================
create table ppr_tyo_pohjat (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  tyyppi text not null check (tyyppi in (
    'kuukausikirjanpito','alv_ilmoitus','palkat',
    'tilinpaatos','veroilmoitus','konsultointi','muu'
  )),
  otsikko_malli text not null,
  kuvaus text,
  prioriteetti text default 'normaali' check (prioriteetti in ('matala','normaali','korkea','kriittinen')),
  arvio_h numeric(6,2),
  deadline_offset_paivat integer default 0,
  aktiivinen boolean not null default true,
  luotu timestamptz not null default now()
);

create table ppr_tyo_pohja_tehtavat (
  id uuid primary key default gen_random_uuid(),
  pohja_id uuid not null references ppr_tyo_pohjat(id) on delete cascade,
  otsikko text not null,
  jarjestys integer default 0
);

create index idx_ppr_tyo_pohja_tehtavat_pohja on ppr_tyo_pohja_tehtavat(pohja_id);

-- =====================================================
-- TOISTUVUUDET (per asiakas + pohja)
-- =====================================================
create table ppr_toistuvuudet (
  id uuid primary key default gen_random_uuid(),
  asiakas_id uuid not null references ppr_kirjanpitoasiakkaat(id) on delete cascade,
  pohja_id uuid not null references ppr_tyo_pohjat(id) on delete restrict,
  vastuuhenkilo_email text,

  frekvenssi text not null check (frekvenssi in (
    'paivittain','viikoittain','kuukausittain',
    'neljannesvuosittain','puolivuosittain','vuosittain',
    'mukautettu'
  )),
  intervalli integer not null default 1,

  viikonpaivat integer[],
  kuukauden_paiva integer,
  kuukaudet integer[],

  rrule_lauseke text,

  alkupvm date not null,
  loppupvm date,
  seuraava_luonti_pvm date not null,

  luo_paivia_etukateen integer not null default 14,

  aktiivinen boolean not null default true,
  luotu timestamptz not null default now(),
  paivitetty timestamptz not null default now()
);

create index idx_ppr_toistuvuudet_asiakas on ppr_toistuvuudet(asiakas_id);
create index idx_ppr_toistuvuudet_seuraava on ppr_toistuvuudet(seuraava_luonti_pvm) where aktiivinen = true;

-- =====================================================
-- TYÖT (kanban-kortit)
-- =====================================================
create table ppr_tyot (
  id uuid primary key default gen_random_uuid(),
  asiakas_id uuid not null references ppr_kirjanpitoasiakkaat(id) on delete cascade,
  toistuvuus_id uuid references ppr_toistuvuudet(id) on delete set null,
  pohja_id uuid references ppr_tyo_pohjat(id) on delete set null,

  tyyppi text not null check (tyyppi in (
    'kuukausikirjanpito','alv_ilmoitus','palkat',
    'tilinpaatos','veroilmoitus','konsultointi','muu'
  )),
  otsikko text not null,
  kuvaus text,
  status text not null default 'jonossa' check (status in (
    'jonossa','tyon_alla','tarkistuksessa','valmis','toimitettu'
  )),
  prioriteetti text not null default 'normaali' check (prioriteetti in ('matala','normaali','korkea','kriittinen')),
  vastuuhenkilo_email text,
  deadline date,
  kausi text,
  arvio_h numeric(6,2),
  toteutunut_h numeric(6,2) default 0,
  jarjestys integer default 0,
  luotu timestamptz not null default now(),
  paivitetty timestamptz not null default now(),
  luoja_email text,

  unique (asiakas_id, pohja_id, kausi)
);

create index idx_ppr_tyot_asiakas on ppr_tyot(asiakas_id);
create index idx_ppr_tyot_status on ppr_tyot(status);
create index idx_ppr_tyot_vastuuhenkilo on ppr_tyot(vastuuhenkilo_email);
create index idx_ppr_tyot_toistuvuus on ppr_tyot(toistuvuus_id);

create table ppr_tyo_tehtavat (
  id uuid primary key default gen_random_uuid(),
  tyo_id uuid not null references ppr_tyot(id) on delete cascade,
  otsikko text not null,
  valmis boolean not null default false,
  vastuuhenkilo_email text,
  deadline date,
  jarjestys integer default 0,
  luotu timestamptz not null default now()
);

create index idx_ppr_tyo_tehtavat_tyo on ppr_tyo_tehtavat(tyo_id);

create table ppr_tyo_kommentit (
  id uuid primary key default gen_random_uuid(),
  tyo_id uuid not null references ppr_tyot(id) on delete cascade,
  kayttaja_email text not null,
  kommentti text not null,
  luotu timestamptz not null default now()
);

create index idx_ppr_tyo_kommentit_tyo on ppr_tyo_kommentit(tyo_id);

-- =====================================================
-- TRIGGERS: paivitetty-aikaleima
-- =====================================================
create or replace function update_paivitetty_aikaleima()
returns trigger as $$
begin new.paivitetty = now(); return new; end;
$$ language plpgsql;

create trigger trg_ppr_tyot_paivitetty
  before update on ppr_tyot
  for each row execute function update_paivitetty_aikaleima();

create trigger trg_ppr_toistuvuudet_paivitetty
  before update on ppr_toistuvuudet
  for each row execute function update_paivitetty_aikaleima();

-- =====================================================
-- RLS
-- =====================================================
alter table ppr_tyo_pohjat enable row level security;
alter table ppr_tyo_pohja_tehtavat enable row level security;
alter table ppr_toistuvuudet enable row level security;
alter table ppr_tyot enable row level security;
alter table ppr_tyo_tehtavat enable row level security;
alter table ppr_tyo_kommentit enable row level security;

-- Pohjat: kaikille kirjautuneille
create policy "pohjat_select_all_authenticated" on ppr_tyo_pohjat
  for select using (auth.role() = 'authenticated');
create policy "pohjat_modify_all_authenticated" on ppr_tyo_pohjat
  for all using (auth.role() = 'authenticated');
create policy "pohja_tehtavat_all_authenticated" on ppr_tyo_pohja_tehtavat
  for all using (auth.role() = 'authenticated');

-- Toistuvuudet, työt, tehtävät, kommentit: johdettu asiakas-pääsystä
create policy "toistuvuudet_via_asiakas" on ppr_toistuvuudet
  for all using (asiakas_id in (select id from ppr_kirjanpitoasiakkaat));
create policy "tyot_via_asiakas" on ppr_tyot
  for all using (asiakas_id in (select id from ppr_kirjanpitoasiakkaat));
create policy "tyo_tehtavat_via_tyo" on ppr_tyo_tehtavat
  for all using (tyo_id in (select id from ppr_tyot));
create policy "tyo_kommentit_via_tyo" on ppr_tyo_kommentit
  for all using (tyo_id in (select id from ppr_tyot));

-- Service role ohittaa RLS:n automaattisesti (cron + API-routet)

-- =====================================================
-- SEED: Esiasennetut työpohjat + oletustehtävät
-- =====================================================

-- 1. Kuukausikirjanpito
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('Kuukausikirjanpito', 'kuukausikirjanpito', '{kausi_nimi} kirjanpito', 'Kuukausittainen kirjanpito asiakkaalle', 'normaali', 8.00, 20)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Tositteet', 0),
  ('Tiliöinti', 1),
  ('Täsmäytys', 2),
  ('ALV', 3),
  ('Asiakaspalaute', 4)
) as t(otsikko, jarjestys);

-- 2. ALV-ilmoitus (kuukausivelvollinen)
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('ALV-ilmoitus', 'alv_ilmoitus', 'ALV {kausi_nimi}', 'Kuukausittainen ALV-ilmoitus', 'korkea', 2.00, 0)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Laske ALV', 0),
  ('Tarkista', 1),
  ('Lähetä', 2)
) as t(otsikko, jarjestys);

-- 3. Palkat
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('Palkat', 'palkat', '{kausi_nimi} palkat', 'Kuukausittainen palkanlaskenta', 'korkea', 4.00, 0)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Aineisto', 0),
  ('Lasku', 1),
  ('Maksu', 2),
  ('Ilmoitukset', 3)
) as t(otsikko, jarjestys);

-- 4. Tilinpäätös
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('Tilinpäätös', 'tilinpaatos', 'Tilinpäätös {kausi_nimi}', 'Vuosittainen tilinpäätös', 'kriittinen', 20.00, 0)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Tase-erittely', 0),
  ('Tuloslaskelma', 1),
  ('Liitetiedot', 2),
  ('Allekirjoitukset', 3),
  ('Rekisteröinti', 4)
) as t(otsikko, jarjestys);

-- 5. Veroilmoitus
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('Veroilmoitus', 'veroilmoitus', 'Veroilmoitus {kausi_nimi}', 'Vuosittainen veroilmoitus', 'kriittinen', 6.00, 0)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Aineisto', 0),
  ('Lasku', 1),
  ('Tarkistus', 2),
  ('Lähetys', 3)
) as t(otsikko, jarjestys);

-- 6. Neljännesvuosi-ALV
with pohja as (
  insert into ppr_tyo_pohjat (nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat)
  values ('Neljännesvuosi-ALV', 'alv_ilmoitus', 'ALV {kausi_nimi}', 'Neljännesvuosittainen ALV-ilmoitus', 'korkea', 3.00, 0)
  returning id
)
insert into ppr_tyo_pohja_tehtavat (pohja_id, otsikko, jarjestys)
select pohja.id, t.otsikko, t.jarjestys
from pohja, (values
  ('Laske', 0),
  ('Tarkista', 1),
  ('Lähetä', 2)
) as t(otsikko, jarjestys);
