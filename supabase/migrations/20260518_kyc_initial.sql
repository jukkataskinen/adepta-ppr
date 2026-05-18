-- =====================================================
-- Adepta KYC — Tietomallin alustava skeema
-- Rahanpesulaki (444/2017), AVI/LVV-tarkastus
-- =====================================================

-- Erilliset skeemat pakote- ja SAR-tiedoille
CREATE SCHEMA IF NOT EXISTS kyc_pakote;
CREATE SCHEMA IF NOT EXISTS kyc_sar;

-- =====================================================
-- 1. Tilitoimisto ja käyttäjät
-- =====================================================

CREATE TABLE kyc_tilitoimistot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nimi TEXT NOT NULL,
  y_tunnus TEXT UNIQUE NOT NULL,
  osoite TEXT,
  postinumero TEXT,
  postitoimipaikka TEXT,
  rahanpesun_vastuuhenkilo_id UUID, -- täytetään myöhemmin
  rahanpesun_valvontarekisteri_nro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kyc_kayttajat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  auth0_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  nimi TEXT NOT NULL,
  rooli TEXT NOT NULL CHECK (rooli IN ('admin','vastuuhenkilo','kirjanpitaja','katselija')),
  aktiivinen BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aseta vastuuhenkilö-FK nyt kun kyc_kayttajat on olemassa
ALTER TABLE kyc_tilitoimistot
  ADD CONSTRAINT fk_tilitoimisto_vastuuhenkilo
  FOREIGN KEY (rahanpesun_vastuuhenkilo_id) REFERENCES kyc_kayttajat(id);

-- =====================================================
-- 2. Asiakkaat
-- =====================================================

CREATE TABLE kyc_asiakkaat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  ppr_asiakas_id UUID, -- valinnainen linkki PPR-asiakkaaseen (ei FK, voi olla eri DB)
  asiakastyyppi TEXT NOT NULL CHECK (asiakastyyppi IN ('yritys','yhteiso','luonnollinen_henkilo')),

  nimi TEXT NOT NULL,
  y_tunnus TEXT,
  oikeudellinen_muoto TEXT,
  kotipaikka TEXT,
  toimiala_koodi TEXT,
  toimiala_nimi TEXT,
  perustamispaiva DATE,

  osoite TEXT,
  postinumero TEXT,
  postitoimipaikka TEXT,
  maa TEXT DEFAULT 'FI',

  asiakassuhde_alkanut DATE NOT NULL,
  asiakassuhde_paattynyt DATE,
  palvelut TEXT[],
  arvioitu_liikevaihto NUMERIC,

  voimassa_oleva_riskitaso TEXT CHECK (voimassa_oleva_riskitaso IN ('matala','normaali','korkea')),
  tehostettu_tunteminen BOOLEAN DEFAULT FALSE,
  pep_status BOOLEAN DEFAULT FALSE,

  poistettava_aikaisintaan DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES kyc_kayttajat(id),
  updated_by UUID REFERENCES kyc_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_asiakkaat_tilitoimisto ON kyc_asiakkaat(tilitoimisto_id);
CREATE INDEX idx_kyc_asiakkaat_y_tunnus ON kyc_asiakkaat(y_tunnus) WHERE y_tunnus IS NOT NULL;
CREATE INDEX idx_kyc_asiakkaat_riskitaso ON kyc_asiakkaat(voimassa_oleva_riskitaso);

-- =====================================================
-- 2b. Edustajat
-- =====================================================

CREATE TABLE kyc_edustajat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),

  etunimet TEXT NOT NULL,
  sukunimi TEXT NOT NULL,
  henkilotunnus_hash TEXT,
  henkilotunnus_nelinumero TEXT,
  syntymapaiva DATE,
  kansalaisuus TEXT DEFAULT 'FI',

  rooli TEXT NOT NULL,
  edustusoikeus TEXT,
  rooli_alkanut DATE,
  rooli_paattynyt DATE,

  pep_status BOOLEAN DEFAULT FALSE,
  pep_peruste TEXT,
  pep_rca_tyyppi TEXT CHECK (pep_rca_tyyppi IN ('pep','perheenjasen','lahipiiri','ei')),

  email TEXT,
  puhelin TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES kyc_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_edustajat_asiakas ON kyc_edustajat(asiakas_id);
CREATE INDEX idx_kyc_edustajat_pep ON kyc_edustajat(pep_status) WHERE pep_status = TRUE;

-- =====================================================
-- 2c. Tosiasialliset edunsaajat
-- =====================================================

CREATE TABLE kyc_edunsaajat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),

  etunimet TEXT NOT NULL,
  sukunimi TEXT NOT NULL,
  henkilotunnus_hash TEXT,
  henkilotunnus_nelinumero TEXT,
  syntymapaiva DATE,
  kansalaisuus TEXT DEFAULT 'FI',
  asuinmaa TEXT DEFAULT 'FI',

  omistusosuus_prosentti NUMERIC(5,2),
  maaraysvaltatyyppi TEXT NOT NULL CHECK (maaraysvaltatyyppi IN (
    'suora_omistus','valillinen_omistus','aanivalta','muu_maaraysvalta','johtoasema_ei_edunsaajaa'
  )),
  maaraysvalta_kuvaus TEXT,

  lahde_prh BOOLEAN DEFAULT FALSE,
  lahde_asiakas_ilmoitus BOOLEAN DEFAULT FALSE,
  lahde_muu TEXT,
  lahteet_tarkistettu_pvm DATE,

  pep_status BOOLEAN DEFAULT FALSE,
  pep_peruste TEXT,
  pep_rca_tyyppi TEXT CHECK (pep_rca_tyyppi IN ('pep','perheenjasen','lahipiiri','ei')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES kyc_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_edunsaajat_asiakas ON kyc_edunsaajat(asiakas_id);
CREATE INDEX idx_kyc_edunsaajat_pep ON kyc_edunsaajat(pep_status) WHERE pep_status = TRUE;

-- =====================================================
-- 3. Henkilöllisyyden todentaminen
-- =====================================================

CREATE TABLE kyc_henkilollisyystodennukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),
  edustaja_id UUID REFERENCES kyc_edustajat(id),
  luonnollinen_henkilo_id UUID,

  todennustyyppi TEXT NOT NULL CHECK (todennustyyppi IN (
    'kasvotusten','etatunnistus_vahva','etatunnistus_muu','viralliset_asiakirjat_kopio'
  )),

  asiakirjatyyppi TEXT,
  asiakirjan_myontaja TEXT,
  asiakirjan_numero_hash TEXT,
  asiakirjan_voimassaolo DATE,

  vahva_tunnistus_palvelu TEXT,
  vahva_tunnistus_transaktio_id TEXT,

  todennettu_pvm DATE NOT NULL,
  todentaja_id UUID NOT NULL REFERENCES kyc_kayttajat(id),
  huomiot TEXT,

  dokumentti_id UUID, -- viittaa kyc_dokumentit, lisätään FK myöhemmin

  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_todennukset_asiakas ON kyc_henkilollisyystodennukset(asiakas_id);
CREATE INDEX idx_kyc_todennukset_edustaja ON kyc_henkilollisyystodennukset(edustaja_id);

-- =====================================================
-- 4. Riskiarviointi
-- =====================================================

CREATE TABLE kyc_riskiarviot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),

  riskitaso TEXT NOT NULL CHECK (riskitaso IN ('matala','normaali','korkea')),
  yhteenveto TEXT NOT NULL,

  riskitekijat JSONB NOT NULL,
  kokonaispisteet INTEGER,

  tehostettu_tunteminen BOOLEAN DEFAULT FALSE,
  tehostetun_perustelut TEXT[],

  varojen_alkupera TEXT,
  varallisuuden_alkupera TEXT,

  arvioija_id UUID NOT NULL REFERENCES kyc_kayttajat(id),
  hyvaksyja_id UUID REFERENCES kyc_kayttajat(id),
  hyvaksytty_pvm DATE,

  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,
  seuraava_paivitys_viimeistaan DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES kyc_kayttajat(id)
);

CREATE INDEX idx_kyc_riskiarviot_asiakas ON kyc_riskiarviot(asiakas_id);
CREATE INDEX idx_kyc_riskiarviot_voimassa ON kyc_riskiarviot(asiakas_id) WHERE voimassa_paattyen IS NULL;
CREATE INDEX idx_kyc_riskiarviot_paivitys ON kyc_riskiarviot(seuraava_paivitys_viimeistaan);

-- =====================================================
-- 5. PEP-tarkistukset
-- =====================================================

CREATE TABLE kyc_pep_tarkistukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),

  tarkistustyyppi TEXT NOT NULL CHECK (tarkistustyyppi IN (
    'asiakkaan_oma_ilmoitus','virallinen_lahde','kaupallinen_palvelu','manuaalinen_tarkistus'
  )),
  tarkistetut_lahteet TEXT[],

  pep_loydetty BOOLEAN NOT NULL,
  perheenjasen_loydetty BOOLEAN DEFAULT FALSE,
  lahipiiri_loydetty BOOLEAN DEFAULT FALSE,

  yksityiskohdat JSONB,

  tarkistettu_pvm TIMESTAMPTZ NOT NULL,
  tarkistaja_id UUID NOT NULL REFERENCES kyc_kayttajat(id),
  seuraava_tarkistus_viimeistaan DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_pep_tark_asiakas ON kyc_pep_tarkistukset(asiakas_id);
CREATE INDEX idx_kyc_pep_tark_seur ON kyc_pep_tarkistukset(seuraava_tarkistus_viimeistaan);

-- =====================================================
-- 6. Pakote- ja jäädytyslistatarkistukset
-- =====================================================

CREATE TABLE kyc_pakote.tarkistukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL,
  asiakas_id UUID NOT NULL,
  kohde_tyyppi TEXT NOT NULL CHECK (kohde_tyyppi IN ('asiakas','edustaja','edunsaaja')),
  kohde_id UUID NOT NULL,
  kohde_nimi TEXT NOT NULL,

  tarkistetut_listat TEXT[] NOT NULL,
  listojen_versiot JSONB,

  osuma_loytyi BOOLEAN NOT NULL,
  osuman_tyyppi TEXT CHECK (osuman_tyyppi IN ('tarkka','sumea','false_positive','ei_osumaa')),

  tarkistustapa TEXT CHECK (tarkistustapa IN ('automaattinen','manuaalinen')),
  tarkistettu_pvm TIMESTAMPTZ NOT NULL,
  tarkistaja_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pak_tark_asiakas ON kyc_pakote.tarkistukset(asiakas_id);
CREATE INDEX idx_pak_tark_pvm ON kyc_pakote.tarkistukset(tarkistettu_pvm DESC);
CREATE INDEX idx_pak_tark_osuma ON kyc_pakote.tarkistukset(osuma_loytyi) WHERE osuma_loytyi = TRUE;

CREATE TABLE kyc_pakote.osumat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarkistus_id UUID NOT NULL REFERENCES kyc_pakote.tarkistukset(id),

  listanimi TEXT NOT NULL,
  listan_kohde_id TEXT NOT NULL,
  listattu_nimi TEXT NOT NULL,
  syntymapaiva DATE,
  kansalaisuus TEXT,
  ohjelma TEXT,
  rooli TEXT,

  kasittelytila TEXT NOT NULL CHECK (kasittelytila IN (
    'odottaa','vahvistettu_osuma','false_positive','selvityksessa','liiketoimi_jaadytetty'
  )),
  kasittely_kommentti TEXT,
  kasittelija_id UUID,
  kasitelty_pvm TIMESTAMPTZ,

  sar_ilmoitus_id UUID, -- viittaa kyc_sar.ilmoitukset, FK lisätään myöhemmin

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kyc_pakote.listat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_avain TEXT UNIQUE NOT NULL,
  nimi TEXT NOT NULL,
  lahde_url TEXT,
  paivitystiheys TEXT,
  viimeisin_paivitys TIMESTAMPTZ,
  aktiivinen BOOLEAN DEFAULT TRUE
);

-- =====================================================
-- 7. Dokumentit (liitteet)
-- =====================================================

CREATE TABLE kyc_dokumentit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  asiakas_id UUID REFERENCES kyc_asiakkaat(id),

  dokumenttityyppi TEXT NOT NULL CHECK (dokumenttityyppi IN (
    'henkilollisyystodistus','kaupparekisteriote','yhtiojarjestys',
    'edunsaajaselvitys','toimeksiantosopimus','tilinpaatos',
    'valtakirja','riskiarvio','muu'
  )),
  tiedostonimi TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  koko_tavua BIGINT,

  kuvaus TEXT,
  voimassa_alkaen DATE,
  voimassa_paattyen DATE,

  ladattu_pvm TIMESTAMPTZ DEFAULT NOW(),
  ladannut_id UUID REFERENCES kyc_kayttajat(id),

  poistettava_aikaisintaan DATE,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_dok_asiakas ON kyc_dokumentit(asiakas_id);
CREATE INDEX idx_kyc_dok_tyyppi ON kyc_dokumentit(dokumenttityyppi);

-- Lisää FK henkilöllisyystodennuksiin nyt kun kyc_dokumentit on olemassa
ALTER TABLE kyc_henkilollisyystodennukset
  ADD CONSTRAINT fk_todennukset_dokumentti
  FOREIGN KEY (dokumentti_id) REFERENCES kyc_dokumentit(id);

-- =====================================================
-- 8. SAR-ilmoitukset (epäilyttävät liiketoimet)
-- =====================================================

CREATE TABLE kyc_sar.ilmoitukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL,
  asiakas_id UUID NOT NULL,

  asiakas_nimi TEXT NOT NULL,
  asiakas_y_tunnus TEXT,

  epaily_tyyppi TEXT NOT NULL CHECK (epaily_tyyppi IN (
    'rahanpesu','terrorismin_rahoitus','pakoterikkomus','muu'
  )),
  epailyn_kuvaus TEXT NOT NULL,
  havaintopvm DATE NOT NULL,

  liittyvat_liiketoimet JSONB,

  goaml_ilmoitettu BOOLEAN DEFAULT FALSE,
  goaml_ilmoitus_pvm TIMESTAMPTZ,
  goaml_referenssi TEXT,

  ilmoittaja_id UUID NOT NULL,
  vastuuhenkilo_kasitellyt UUID,
  kasittelytila TEXT NOT NULL CHECK (kasittelytila IN (
    'luonnos','sisaisesti_arvioitu','ilmoitettu_keskukselle','ei_ilmoitettavaa','keskeytetty'
  )),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  poistettava_aikaisintaan DATE
);

CREATE TABLE kyc_sar.kasittelyloki (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ilmoitus_id UUID NOT NULL REFERENCES kyc_sar.ilmoitukset(id),
  toiminto TEXT NOT NULL,
  kayttaja_id UUID NOT NULL,
  kommentti TEXT,
  tapahtumahetki TIMESTAMPTZ DEFAULT NOW()
);

-- Lisää FK pakote.osumat -> sar.ilmoitukset nyt
ALTER TABLE kyc_pakote.osumat
  ADD CONSTRAINT fk_osumat_sar_ilmoitus
  FOREIGN KEY (sar_ilmoitus_id) REFERENCES kyc_sar.ilmoitukset(id);

-- =====================================================
-- 9. Audit-loki
-- =====================================================

CREATE TABLE kyc_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tilitoimisto_id UUID NOT NULL,
  kayttaja_id UUID,

  tapahtumatyyppi TEXT NOT NULL,
  taulu TEXT NOT NULL,
  rivi_id UUID,

  vanhat_arvot JSONB,
  uudet_arvot JSONB,

  ip_osoite INET,
  user_agent TEXT,

  tapahtumahetki TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_audit_tilitoimisto ON kyc_audit_log(tilitoimisto_id, tapahtumahetki DESC);
CREATE INDEX idx_kyc_audit_rivi ON kyc_audit_log(taulu, rivi_id);
CREATE INDEX idx_kyc_audit_kayttaja ON kyc_audit_log(kayttaja_id, tapahtumahetki DESC);

-- =====================================================
-- 10. Tilitoimiston omat dokumentit
-- =====================================================

CREATE TABLE kyc_toimintamallin_riskiarviot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  versio TEXT NOT NULL,
  yhteenveto TEXT NOT NULL,
  sisalto_md TEXT NOT NULL,
  pdf_storage_path TEXT,

  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,

  hyvaksyja_id UUID REFERENCES kyc_kayttajat(id),
  hyvaksytty_pvm DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES kyc_kayttajat(id)
);

CREATE TABLE kyc_sisaiset_ohjeet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  versio TEXT NOT NULL,
  otsikko TEXT NOT NULL,
  sisalto_md TEXT NOT NULL,
  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,
  hyvaksyja_id UUID REFERENCES kyc_kayttajat(id),
  hyvaksytty_pvm DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kyc_koulutukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tilitoimisto_id UUID NOT NULL REFERENCES kyc_tilitoimistot(id),
  otsikko TEXT NOT NULL,
  kuvaus TEXT,
  materiaali_url TEXT,
  pidetty_pvm DATE NOT NULL,
  kouluttaja TEXT,
  kesto_minuuttia INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kyc_koulutusosallistumiset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  koulutus_id UUID NOT NULL REFERENCES kyc_koulutukset(id),
  kayttaja_id UUID NOT NULL REFERENCES kyc_kayttajat(id),
  suoritettu_pvm DATE NOT NULL,
  vahvistus_dokumentti_id UUID REFERENCES kyc_dokumentit(id),
  UNIQUE(koulutus_id, kayttaja_id)
);

-- =====================================================
-- 11. Jatkuva seuranta
-- =====================================================

CREATE TABLE kyc_seurantakirjaukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),

  kirjaustyyppi TEXT NOT NULL CHECK (kirjaustyyppi IN (
    'tietojen_paivitys','poikkeava_liiketoimi','asiakkaan_yhteydenotto',
    'selvityspyynto','vastaanotettu_selvitys','vuosipaivitys','muu'
  )),
  kuvaus TEXT NOT NULL,
  liittyva_dokumentti_id UUID REFERENCES kyc_dokumentit(id),

  kirjannut_id UUID NOT NULL REFERENCES kyc_kayttajat(id),
  kirjattu_pvm TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_seuranta_asiakas ON kyc_seurantakirjaukset(asiakas_id, kirjattu_pvm DESC);

-- =====================================================
-- 12. Row Level Security
-- =====================================================

ALTER TABLE kyc_tilitoimistot ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_kayttajat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_asiakkaat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_edustajat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_edunsaajat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_henkilollisyystodennukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_riskiarviot ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_pep_tarkistukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_dokumentit ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_toimintamallin_riskiarviot ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_sisaiset_ohjeet ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_koulutukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_koulutusosallistumiset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_seurantakirjaukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_pakote.tarkistukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_pakote.osumat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_pakote.listat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_sar.ilmoitukset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_sar.kasittelyloki ENABLE ROW LEVEL SECURITY;

-- Tilitoimisto-scope: kaikille kyc_-tauluille joissa tilitoimisto_id
CREATE POLICY tilitoimisto_select ON kyc_tilitoimistot
  FOR SELECT USING (id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

CREATE POLICY kayttajat_select ON kyc_kayttajat
  FOR SELECT USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);
CREATE POLICY kayttajat_modify ON kyc_kayttajat
  FOR ALL USING (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (auth.jwt() ->> 'rooli') IN ('admin','vastuuhenkilo')
  );

CREATE POLICY asiakkaat_select ON kyc_asiakkaat
  FOR SELECT USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);
CREATE POLICY asiakkaat_modify ON kyc_asiakkaat
  FOR ALL USING (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (auth.jwt() ->> 'rooli') IN ('admin','vastuuhenkilo','kirjanpitaja')
  );

-- Asiakas-johdetut taulut: pääsy jos asiakas_id kuuluu tilitoimistolle
CREATE POLICY edustajat_all ON kyc_edustajat
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY edunsaajat_all ON kyc_edunsaajat
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY todennukset_all ON kyc_henkilollisyystodennukset
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY riskiarviot_all ON kyc_riskiarviot
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY pep_tark_all ON kyc_pep_tarkistukset
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY seuranta_all ON kyc_seurantakirjaukset
  FOR ALL USING (asiakas_id IN (
    SELECT id FROM kyc_asiakkaat WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY dokumentit_select ON kyc_dokumentit
  FOR SELECT USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);
CREATE POLICY dokumentit_modify ON kyc_dokumentit
  FOR ALL USING (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (auth.jwt() ->> 'rooli') IN ('admin','vastuuhenkilo','kirjanpitaja')
  );

CREATE POLICY toimintamalli_all ON kyc_toimintamallin_riskiarviot
  FOR ALL USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

CREATE POLICY ohjeet_all ON kyc_sisaiset_ohjeet
  FOR ALL USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

CREATE POLICY koulutukset_all ON kyc_koulutukset
  FOR ALL USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

CREATE POLICY koulutusosall_all ON kyc_koulutusosallistumiset
  FOR ALL USING (koulutus_id IN (
    SELECT id FROM kyc_koulutukset WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY audit_select ON kyc_audit_log
  FOR SELECT USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

-- Pakote: tilitoimisto-scope
CREATE POLICY pakote_tark_select ON kyc_pakote.tarkistukset
  FOR SELECT USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);
CREATE POLICY pakote_tark_modify ON kyc_pakote.tarkistukset
  FOR ALL USING (tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID);

CREATE POLICY pakote_osumat_all ON kyc_pakote.osumat
  FOR ALL USING (tarkistus_id IN (
    SELECT id FROM kyc_pakote.tarkistukset WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
  ));

CREATE POLICY pakote_listat_select ON kyc_pakote.listat
  FOR SELECT USING (TRUE); -- master-data, kaikille luettavissa

-- SAR: vain ilmoittaja + vastuuhenkilö (tipping-off-kielto)
CREATE POLICY sar_ilmoitukset_select ON kyc_sar.ilmoitukset
  FOR SELECT USING (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (
      ilmoittaja_id = (auth.jwt() ->> 'kayttaja_id')::UUID
      OR (auth.jwt() ->> 'rooli') = 'vastuuhenkilo'
    )
  );
CREATE POLICY sar_ilmoitukset_insert ON kyc_sar.ilmoitukset
  FOR INSERT WITH CHECK (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (auth.jwt() ->> 'rooli') IN ('admin','vastuuhenkilo','kirjanpitaja')
  );
CREATE POLICY sar_ilmoitukset_update ON kyc_sar.ilmoitukset
  FOR UPDATE USING (
    tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (
      ilmoittaja_id = (auth.jwt() ->> 'kayttaja_id')::UUID
      OR (auth.jwt() ->> 'rooli') = 'vastuuhenkilo'
    )
  );

CREATE POLICY sar_loki_all ON kyc_sar.kasittelyloki
  FOR ALL USING (ilmoitus_id IN (
    SELECT id FROM kyc_sar.ilmoitukset
    WHERE tilitoimisto_id = (auth.jwt() ->> 'tilitoimisto_id')::UUID
    AND (
      ilmoittaja_id = (auth.jwt() ->> 'kayttaja_id')::UUID
      OR (auth.jwt() ->> 'rooli') = 'vastuuhenkilo'
    )
  ));

-- =====================================================
-- 13. Triggerit
-- =====================================================

-- Säilytysajan automaattinen laskenta
CREATE OR REPLACE FUNCTION kyc_laske_poistoaika() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asiakassuhde_paattynyt IS NOT NULL THEN
    NEW.poistettava_aikaisintaan := NEW.asiakassuhde_paattynyt + INTERVAL '5 years';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kyc_asiakkaat_poistoaika
  BEFORE INSERT OR UPDATE ON kyc_asiakkaat
  FOR EACH ROW EXECUTE FUNCTION kyc_laske_poistoaika();

-- updated_at automaattisesti
CREATE OR REPLACE FUNCTION kyc_paivita_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kyc_tilitoimistot_updated BEFORE UPDATE ON kyc_tilitoimistot
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_kayttajat_updated BEFORE UPDATE ON kyc_kayttajat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_asiakkaat_updated BEFORE UPDATE ON kyc_asiakkaat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_edustajat_updated BEFORE UPDATE ON kyc_edustajat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_edunsaajat_updated BEFORE UPDATE ON kyc_edunsaajat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_sar_ilmoitukset_updated BEFORE UPDATE ON kyc_sar.ilmoitukset
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();

-- Audit-loki automaattisesti kriittisille tauluille
CREATE OR REPLACE FUNCTION kyc_kirjaa_audit() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO kyc_audit_log (
    tilitoimisto_id, kayttaja_id, tapahtumatyyppi, taulu, rivi_id, vanhat_arvot, uudet_arvot
  ) VALUES (
    COALESCE(NEW.tilitoimisto_id, OLD.tilitoimisto_id),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'kayttaja_id', '')::UUID,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kyc_asiakkaat_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_asiakkaat
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_edustajat_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_edustajat
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_edunsaajat_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_edunsaajat
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_riskiarviot_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_riskiarviot
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_todennukset_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_henkilollisyystodennukset
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();

-- =====================================================
-- 14. Näkymät raportointia varten
-- =====================================================

CREATE VIEW kyc_asiakas_status AS
SELECT
  a.id,
  a.tilitoimisto_id,
  a.nimi,
  a.y_tunnus,
  a.asiakastyyppi,
  a.voimassa_oleva_riskitaso,
  a.tehostettu_tunteminen,
  a.pep_status,
  a.asiakassuhde_alkanut,
  a.asiakassuhde_paattynyt,
  (SELECT MAX(tarkistettu_pvm) FROM kyc_pep_tarkistukset WHERE asiakas_id = a.id) AS viimeisin_pep_tarkistus,
  (SELECT MAX(tarkistettu_pvm) FROM kyc_pakote.tarkistukset WHERE asiakas_id = a.id) AS viimeisin_pakote_tarkistus,
  (SELECT seuraava_paivitys_viimeistaan FROM kyc_riskiarviot WHERE asiakas_id = a.id AND voimassa_paattyen IS NULL LIMIT 1) AS riskiarvio_paivitettava,
  (SELECT COUNT(*) FROM kyc_edunsaajat WHERE asiakas_id = a.id AND deleted_at IS NULL) AS edunsaajia,
  (SELECT COUNT(*) FROM kyc_henkilollisyystodennukset WHERE asiakas_id = a.id AND deleted_at IS NULL) AS todennuksia
FROM kyc_asiakkaat a
WHERE a.deleted_at IS NULL;

CREATE VIEW kyc_huomiota_vaativat AS
SELECT
  a.id, a.tilitoimisto_id, a.nimi, a.y_tunnus,
  CASE
    WHEN ra.seuraava_paivitys_viimeistaan < CURRENT_DATE THEN 'riskiarvio_vanhentunut'
    WHEN pep.seuraava_tarkistus_viimeistaan < CURRENT_DATE THEN 'pep_tarkistus_vanhentunut'
    WHEN ra.id IS NULL THEN 'riskiarvio_puuttuu'
    WHEN pep.id IS NULL THEN 'pep_tarkistus_puuttuu'
  END AS syy
FROM kyc_asiakkaat a
LEFT JOIN kyc_riskiarviot ra ON ra.asiakas_id = a.id AND ra.voimassa_paattyen IS NULL
LEFT JOIN LATERAL (
  SELECT id, seuraava_tarkistus_viimeistaan
  FROM kyc_pep_tarkistukset
  WHERE asiakas_id = a.id
  ORDER BY tarkistettu_pvm DESC LIMIT 1
) pep ON TRUE
WHERE a.deleted_at IS NULL
  AND a.asiakassuhde_paattynyt IS NULL
  AND (
    ra.id IS NULL
    OR ra.seuraava_paivitys_viimeistaan < CURRENT_DATE
    OR pep.id IS NULL
    OR pep.seuraava_tarkistus_viimeistaan < CURRENT_DATE
  );
