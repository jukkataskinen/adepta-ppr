-- =====================================================
-- Adepta KYC — Tietomallin alustava skeema (v2)
-- Rahanpesulaki (444/2017), AVI/LVV-tarkastus
--
-- Integroitu PPR:n olemassa oleviin rakenteisiin:
--   - Tenant: ppr_organisaatiot (organisaatio_id)
--   - Käyttäjät: ppr_kayttajat (ei omaa kyc_kayttajat-taulua)
--   - Asiakkaat: ppr_kirjanpitoasiakkaat (pakollinen linkki)
--   - Turvakerros: service_role + sovelluslogiikka (ei RLS)
--
-- EI LUODA: kyc_tilitoimistot, kyc_kayttajat
-- EI LUODA: RLS-policyjä (tenant-rajaus API-kerroksessa)
-- =====================================================

-- Erilliset skeemat pakote- ja SAR-tiedoille
CREATE SCHEMA IF NOT EXISTS kyc_pakote;
CREATE SCHEMA IF NOT EXISTS kyc_sar;

-- =====================================================
-- 0. Muutokset PPR:n olemassa oleviin tauluihin
-- =====================================================

-- Rahanpesun vastuuhenkilö organisaatiotasolle
ALTER TABLE ppr_organisaatiot
  ADD COLUMN IF NOT EXISTS rahanpesun_vastuuhenkilo_id UUID REFERENCES ppr_kayttajat(id);

COMMENT ON COLUMN ppr_organisaatiot.rahanpesun_vastuuhenkilo_id IS
  'Rahanpesulain mukainen vastuuhenkilö (kyc_kayttaja_roolit.rooli = kyc_vastuuhenkilo)';

-- =====================================================
-- 1. KYC-käyttäjäroolit (pivot ppr_kayttajat-tauluun)
-- =====================================================

CREATE TABLE kyc_kayttaja_roolit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kayttaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  rooli TEXT NOT NULL CHECK (rooli IN ('kyc_vastuuhenkilo','kyc_kirjanpitaja','kyc_katselija')),
  myonnetty_pvm DATE NOT NULL DEFAULT CURRENT_DATE,
  myonnetty_by UUID REFERENCES ppr_kayttajat(id),
  UNIQUE(kayttaja_id, rooli)
);

-- =====================================================
-- 2. Asiakkaat (KYC-laajennos ppr_kirjanpitoasiakkaat-tauluun)
--
-- nimi, y_tunnus, osoite, postinumero, postitoimipaikka
-- löytyvät jo ppr_kirjanpitoasiakkaat-taulusta — ei duplikoida.
-- ppr_asiakas_id on pakollinen linkki.
-- organisaatio_id johdetaan ppr_kirjanpitoasiakkaat.organisaatio_id
-- kautta — ei tarvita omaa kenttää.
-- =====================================================

CREATE TABLE kyc_asiakkaat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ppr_asiakas_id UUID NOT NULL REFERENCES ppr_kirjanpitoasiakkaat(id),

  asiakastyyppi TEXT NOT NULL CHECK (asiakastyyppi IN ('yritys','yhteiso','luonnollinen_henkilo')),

  -- KYC-spesifiset kentät joita PPR-asiakkaalla ei ole
  oikeudellinen_muoto TEXT,
  kotipaikka TEXT,
  toimiala_koodi TEXT,
  toimiala_nimi TEXT,
  perustamispaiva DATE,
  maa TEXT DEFAULT 'FI',

  asiakassuhde_alkanut DATE NOT NULL,
  asiakassuhde_paattynyt DATE,
  palvelut TEXT[],
  arvioitu_liikevaihto NUMERIC,

  -- Riskimerkinnät (denormalisointi, päärekisteri kyc_riskiarviot)
  voimassa_oleva_riskitaso TEXT CHECK (voimassa_oleva_riskitaso IN ('matala','normaali','korkea')),
  tehostettu_tunteminen BOOLEAN DEFAULT FALSE,
  pep_status BOOLEAN DEFAULT FALSE,

  -- Säilytysaika
  poistettava_aikaisintaan DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES ppr_kayttajat(id),
  updated_by UUID REFERENCES ppr_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_kyc_asiakkaat_ppr ON kyc_asiakkaat(ppr_asiakas_id);
CREATE INDEX idx_kyc_asiakkaat_riskitaso ON kyc_asiakkaat(voimassa_oleva_riskitaso);

-- =====================================================
-- 3. Edustajat (hallitus, tj, prokuristit, valtuutetut)
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
  created_by UUID REFERENCES ppr_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_edustajat_asiakas ON kyc_edustajat(asiakas_id);
CREATE INDEX idx_kyc_edustajat_pep ON kyc_edustajat(pep_status) WHERE pep_status = TRUE;

-- =====================================================
-- 4. Tosiasialliset edunsaajat
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
  created_by UUID REFERENCES ppr_kayttajat(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_edunsaajat_asiakas ON kyc_edunsaajat(asiakas_id);
CREATE INDEX idx_kyc_edunsaajat_pep ON kyc_edunsaajat(pep_status) WHERE pep_status = TRUE;

-- =====================================================
-- 5. Henkilöllisyyden todentaminen
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
  todentaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  huomiot TEXT,

  dokumentti_id UUID, -- FK lisätään kun kyc_dokumentit on luotu

  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_todennukset_asiakas ON kyc_henkilollisyystodennukset(asiakas_id);
CREATE INDEX idx_kyc_todennukset_edustaja ON kyc_henkilollisyystodennukset(edustaja_id);

-- =====================================================
-- 6. Riskiarviointi (versioitu)
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

  arvioija_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  hyvaksyja_id UUID REFERENCES ppr_kayttajat(id),
  hyvaksytty_pvm DATE,

  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,
  seuraava_paivitys_viimeistaan DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES ppr_kayttajat(id)
);

CREATE INDEX idx_kyc_riskiarviot_asiakas ON kyc_riskiarviot(asiakas_id);
CREATE INDEX idx_kyc_riskiarviot_voimassa ON kyc_riskiarviot(asiakas_id) WHERE voimassa_paattyen IS NULL;
CREATE INDEX idx_kyc_riskiarviot_paivitys ON kyc_riskiarviot(seuraava_paivitys_viimeistaan);

-- =====================================================
-- 7. PEP-tarkistukset
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
  tarkistaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  seuraava_tarkistus_viimeistaan DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_pep_tark_asiakas ON kyc_pep_tarkistukset(asiakas_id);
CREATE INDEX idx_kyc_pep_tark_seur ON kyc_pep_tarkistukset(seuraava_tarkistus_viimeistaan);

-- =====================================================
-- 8. Pakote- ja jäädytyslistatarkistukset (erillinen skeema)
-- =====================================================

CREATE TABLE kyc_pakote.tarkistukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
  asiakas_id UUID NOT NULL REFERENCES kyc_asiakkaat(id),
  kohde_tyyppi TEXT NOT NULL CHECK (kohde_tyyppi IN ('asiakas','edustaja','edunsaaja')),
  kohde_id UUID NOT NULL,
  kohde_nimi TEXT NOT NULL,

  tarkistetut_listat TEXT[] NOT NULL,
  listojen_versiot JSONB,

  osuma_loytyi BOOLEAN NOT NULL,
  osuman_tyyppi TEXT CHECK (osuman_tyyppi IN ('tarkka','sumea','false_positive','ei_osumaa')),

  tarkistustapa TEXT CHECK (tarkistustapa IN ('automaattinen','manuaalinen')),
  tarkistettu_pvm TIMESTAMPTZ NOT NULL,
  tarkistaja_id UUID REFERENCES ppr_kayttajat(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pak_tark_asiakas ON kyc_pakote.tarkistukset(asiakas_id);
CREATE INDEX idx_pak_tark_organisaatio ON kyc_pakote.tarkistukset(organisaatio_id);
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
  kasittelija_id UUID REFERENCES ppr_kayttajat(id),
  kasitelty_pvm TIMESTAMPTZ,

  sar_ilmoitus_id UUID, -- FK lisätään kun kyc_sar.ilmoitukset on luotu

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
-- 9. Dokumentit (liitteet, Supabase Storage private bucket)
-- =====================================================

CREATE TABLE kyc_dokumentit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
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
  ladannut_id UUID REFERENCES ppr_kayttajat(id),

  poistettava_aikaisintaan DATE,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_dok_asiakas ON kyc_dokumentit(asiakas_id);
CREATE INDEX idx_kyc_dok_organisaatio ON kyc_dokumentit(organisaatio_id);
CREATE INDEX idx_kyc_dok_tyyppi ON kyc_dokumentit(dokumenttityyppi);

-- Lisää FK henkilöllisyystodennuksiin nyt kun kyc_dokumentit on olemassa
ALTER TABLE kyc_henkilollisyystodennukset
  ADD CONSTRAINT fk_todennukset_dokumentti
  FOREIGN KEY (dokumentti_id) REFERENCES kyc_dokumentit(id);

-- =====================================================
-- 10. SAR-ilmoitukset (erillinen skeema, tipping-off-kielto)
--
-- Snapshot-tiedot asiakkaasta, koska asiakas voidaan poistaa
-- GDPR-pyynnön myötä mutta SAR säilyy 5v.
-- =====================================================

CREATE TABLE kyc_sar.ilmoitukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
  asiakas_id UUID NOT NULL,

  -- Snapshot (ei FK — asiakas voi olla poistettu)
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

  ilmoittaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  vastuuhenkilo_kasitellyt UUID REFERENCES ppr_kayttajat(id),
  kasittelytila TEXT NOT NULL CHECK (kasittelytila IN (
    'luonnos','sisaisesti_arvioitu','ilmoitettu_keskukselle','ei_ilmoitettavaa','keskeytetty'
  )),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  poistettava_aikaisintaan DATE
);

CREATE INDEX idx_sar_ilmoitukset_organisaatio ON kyc_sar.ilmoitukset(organisaatio_id);

CREATE TABLE kyc_sar.kasittelyloki (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ilmoitus_id UUID NOT NULL REFERENCES kyc_sar.ilmoitukset(id),
  toiminto TEXT NOT NULL,
  kayttaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  kommentti TEXT,
  tapahtumahetki TIMESTAMPTZ DEFAULT NOW()
);

-- Lisää FK pakote.osumat -> sar.ilmoitukset
ALTER TABLE kyc_pakote.osumat
  ADD CONSTRAINT fk_osumat_sar_ilmoitus
  FOREIGN KEY (sar_ilmoitus_id) REFERENCES kyc_sar.ilmoitukset(id);

-- =====================================================
-- 11. Audit-loki
-- =====================================================

CREATE TABLE kyc_audit_log (
  id BIGSERIAL PRIMARY KEY,
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
  kayttaja_id UUID REFERENCES ppr_kayttajat(id),

  tapahtumatyyppi TEXT NOT NULL,
  taulu TEXT NOT NULL,
  rivi_id UUID,

  vanhat_arvot JSONB,
  uudet_arvot JSONB,

  ip_osoite INET,
  user_agent TEXT,

  tapahtumahetki TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_audit_organisaatio ON kyc_audit_log(organisaatio_id, tapahtumahetki DESC);
CREATE INDEX idx_kyc_audit_rivi ON kyc_audit_log(taulu, rivi_id);
CREATE INDEX idx_kyc_audit_kayttaja ON kyc_audit_log(kayttaja_id, tapahtumahetki DESC);

-- =====================================================
-- 12. Tilitoimiston omat compliance-dokumentit
-- =====================================================

CREATE TABLE kyc_toimintamallin_riskiarviot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
  versio TEXT NOT NULL,
  yhteenveto TEXT NOT NULL,
  sisalto_md TEXT NOT NULL,
  pdf_storage_path TEXT,

  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,

  hyvaksyja_id UUID REFERENCES ppr_kayttajat(id),
  hyvaksytty_pvm DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES ppr_kayttajat(id)
);

CREATE TABLE kyc_sisaiset_ohjeet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
  versio TEXT NOT NULL,
  otsikko TEXT NOT NULL,
  sisalto_md TEXT NOT NULL,
  voimassa_alkaen DATE NOT NULL,
  voimassa_paattyen DATE,
  hyvaksyja_id UUID REFERENCES ppr_kayttajat(id),
  hyvaksytty_pvm DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kyc_koulutukset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id UUID NOT NULL REFERENCES ppr_organisaatiot(id),
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
  kayttaja_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  suoritettu_pvm DATE NOT NULL,
  vahvistus_dokumentti_id UUID REFERENCES kyc_dokumentit(id),
  UNIQUE(koulutus_id, kayttaja_id)
);

-- =====================================================
-- 13. Jatkuva seuranta
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

  kirjannut_id UUID NOT NULL REFERENCES ppr_kayttajat(id),
  kirjattu_pvm TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_seuranta_asiakas ON kyc_seurantakirjaukset(asiakas_id, kirjattu_pvm DESC);

-- =====================================================
-- 14. Triggerit
-- =====================================================

-- Säilytysajan automaattinen laskenta (5v asiakassuhteen päättymisestä)
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

CREATE TRIGGER kyc_asiakkaat_updated BEFORE UPDATE ON kyc_asiakkaat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_edustajat_updated BEFORE UPDATE ON kyc_edustajat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_edunsaajat_updated BEFORE UPDATE ON kyc_edunsaajat
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();
CREATE TRIGGER kyc_sar_ilmoitukset_updated BEFORE UPDATE ON kyc_sar.ilmoitukset
  FOR EACH ROW EXECUTE FUNCTION kyc_paivita_updated_at();

-- Audit-loki automaattisesti
-- Käyttäjä tunnistetaan: SET LOCAL kyc.kayttaja_id = '...'; API-kerroksessa
--
-- organisaatio_id johdetaan yleisellä logiikalla (ei hard-koodattuja taulunimiä):
--   1. Rivi sisältää organisaatio_id → käytä suoraan
--   2. Rivi sisältää ppr_asiakas_id → johda ppr_kirjanpitoasiakkaat.organisaatio_id
--   3. Rivi sisältää asiakas_id → johda kyc_asiakkaat → ppr_kirjanpitoasiakkaat
--   4. Muutoin → NULL
CREATE OR REPLACE FUNCTION kyc_kirjaa_audit() RETURNS TRIGGER AS $$
DECLARE
  v_kayttaja_id UUID;
  v_organisaatio_id UUID;
  v_rivi JSONB;
  v_rivi_id UUID;
BEGIN
  -- Hae käyttäjä-id sovelluskerroksesta (SET LOCAL kyc.kayttaja_id)
  v_kayttaja_id := NULLIF(current_setting('kyc.kayttaja_id', true), '')::UUID;

  -- Rakenna JSONB rivin datasta (NEW INSERT/UPDATE:lle, OLD DELETE:lle)
  IF TG_OP = 'DELETE' THEN
    v_rivi := to_jsonb(OLD);
  ELSE
    v_rivi := to_jsonb(NEW);
  END IF;

  -- Rivi-id (UUID) — kaikki lokitettavat taulut käyttävät UUID PK:ta
  v_rivi_id := (v_rivi ->> 'id')::UUID;

  -- Johda organisaatio_id yleisellä logiikalla
  -- Käytetään (v_rivi ->> 'x') IS NOT NULL eikä v_rivi ? 'x',
  -- koska ? palauttaa TRUE myös kun kenttä on olemassa mutta arvo on NULL.
  IF (v_rivi ->> 'organisaatio_id') IS NOT NULL THEN
    -- 1. Suora organisaatio_id (pakote.tarkistukset, sar.ilmoitukset, dokumentit jne.)
    v_organisaatio_id := (v_rivi ->> 'organisaatio_id')::UUID;

  ELSIF (v_rivi ->> 'ppr_asiakas_id') IS NOT NULL THEN
    -- 2. kyc_asiakkaat: ppr_asiakas_id → ppr_kirjanpitoasiakkaat.organisaatio_id
    SELECT ka.organisaatio_id INTO v_organisaatio_id
    FROM ppr_kirjanpitoasiakkaat ka
    WHERE ka.id = (v_rivi ->> 'ppr_asiakas_id')::UUID;

  ELSIF (v_rivi ->> 'asiakas_id') IS NOT NULL THEN
    -- 3. Asiakas-johdetut taulut: asiakas_id → kyc_asiakkaat → ppr_kirjanpitoasiakkaat
    SELECT pka.organisaatio_id INTO v_organisaatio_id
    FROM kyc_asiakkaat a
    JOIN ppr_kirjanpitoasiakkaat pka ON pka.id = a.ppr_asiakas_id
    WHERE a.id = (v_rivi ->> 'asiakas_id')::UUID;

  ELSE
    -- 4. Ei voida johtaa (esim. kyc_kayttaja_roolit) → NULL
    v_organisaatio_id := NULL;
  END IF;

  INSERT INTO kyc_audit_log (
    organisaatio_id, kayttaja_id, tapahtumatyyppi, taulu, rivi_id, vanhat_arvot, uudet_arvot
  ) VALUES (
    v_organisaatio_id,
    v_kayttaja_id,
    TG_OP,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    v_rivi_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Audit-triggerit: public-skeeman taulut
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
CREATE TRIGGER kyc_kayttaja_roolit_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_kayttaja_roolit
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_dokumentit_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_dokumentit
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_toimintamalli_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_toimintamallin_riskiarviot
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_ohjeet_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_sisaiset_ohjeet
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();

-- Audit-triggerit: kyc_pakote-skeeman taulut
CREATE TRIGGER kyc_pakote_tarkistukset_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_pakote.tarkistukset
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_pakote_osumat_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_pakote.osumat
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();

-- Audit-triggerit: kyc_sar-skeeman taulut
CREATE TRIGGER kyc_sar_ilmoitukset_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_sar.ilmoitukset
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();
CREATE TRIGGER kyc_sar_kasittelyloki_audit AFTER INSERT OR UPDATE OR DELETE ON kyc_sar.kasittelyloki
  FOR EACH ROW EXECUTE FUNCTION kyc_kirjaa_audit();

-- =====================================================
-- 15. Näkymät raportointia varten
-- =====================================================

-- Asiakkaan KYC-statuskooste (liitetty ppr_kirjanpitoasiakkaat-tauluun)
CREATE VIEW kyc_asiakas_status AS
SELECT
  a.id,
  a.ppr_asiakas_id,
  ka.organisaatio_id,
  ka.nimi,
  ka.y_tunnus,
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
JOIN ppr_kirjanpitoasiakkaat ka ON ka.id = a.ppr_asiakas_id
WHERE a.deleted_at IS NULL;

-- Toimintaa vaativat asiakkaat (AVI-tarkastuksen kestävyys)
CREATE VIEW kyc_huomiota_vaativat AS
SELECT
  a.id,
  a.ppr_asiakas_id,
  ka.organisaatio_id,
  ka.nimi,
  ka.y_tunnus,
  CASE
    WHEN ra.seuraava_paivitys_viimeistaan < CURRENT_DATE THEN 'riskiarvio_vanhentunut'
    WHEN pep.seuraava_tarkistus_viimeistaan < CURRENT_DATE THEN 'pep_tarkistus_vanhentunut'
    WHEN ra.id IS NULL THEN 'riskiarvio_puuttuu'
    WHEN pep.id IS NULL THEN 'pep_tarkistus_puuttuu'
  END AS syy
FROM kyc_asiakkaat a
JOIN ppr_kirjanpitoasiakkaat ka ON ka.id = a.ppr_asiakas_id
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
