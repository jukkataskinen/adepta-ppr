# Adepta PPR - Tilannekuva vs. SaaS-talushallinto

Pvm: 10.04.2026  
Kohde: Adepta PPR (nykyinen kehitystila)  
Vertailutaso: "Täysin toimiva SaaS-talushallintojärjestelmä" (myynti, osto, pankki, ALV, raportointi, käyttöoikeudet, operointi)

## 1) Yhteenveto

Adepta PPR on edennyt nopeasti demosta käytännön tuotantokelpoisempaan suuntaan erityisesti:
- pankkituonnin ja laskukohdistuksen työnkulussa
- tositteiden liitteiden käsittelyssä
- BA-tositelajin käyttöönotossa
- UI-käytettävyyden parannuksissa

Kokonaisuutena järjestelmä on nyt "toimiva ydinprosesseissa", mutta ei vielä täysiverinen SaaS-taloushallintotuote ilman lisätyötä ALV-kausilogiiikkaan, prosessien koventamiseen, auditointiin, automaatioon, roolitukseen ja operatiiviseen valvontaan.

## 2) Mitä toimii nyt hyvin

### 2.1 Pankkituonti ja kohdistus
- Ohjattu pankkituonti-modal (tiliote -> laskuaineisto -> tarkistus -> kohdistus).
- Nordea OCR -tulkinta palautettu toimivaan nopeaan polkuun.
- Kohdistuksen per-klikkausviivettä pienennetty (taustajono + UI siirtyy nopeasti seuraavaan).
- Keskeytyksen jatkaminen mahdollista (banneri + "jatka kohdistusta").

### 2.2 Tositteet ja liitteet
- BA-suodatin lisätty tositteisiin.
- Tositelistan järjestys korjattu aidosti alenevaksi (numeerinen lajittelu).
- Tositelistan kortit muutettu listamaiseksi (skaalautuu paremmin pitkään dataan).
- BA-liitteet näkyvät tositeselaimessa myös paivakirja-polun kautta.
- Liite-esikatselussa sivunvaihto (monisivuiset PDF:t).
- "Maximum call stack size exceeded" korjattu PDF-esikatselussa.

### 2.3 Kirjauslogiikan kehitys
- BA-tositelaji kytketty pankkikirjauksiin.
- Useita polkuja päivitetty käyttämään uusia ALV-tilejä.
- ALV-laskenta nostettu omaksi kohdaksi Kirjanpito-teeman alle.

## 3) Suurimmat erot täysin toimivaan SaaS-järjestelmään

### 3.1 ALV-prosessi (kriittinen)
- ALV-kauden kirjauslogiikka on työn alla; osa historiasta ja osasta API-polkuja voi olla vanhoja tilikytkentöjä.
- Kuukausiolettama toimii, mutta 3 kk/vuosi puuttuu.
- "Maksamaton ALV ilmoituksittain + avoin kausi" näkymä rakennettu, mutta vaatii vielä koventamista (maksettu/avoin erottelu, edge-case tarkistus).

### 3.2 Prosessien yhtenäisyys
- Saman asian logiikkaa on useassa paikassa (frontend + eri API-polut), mikä lisää regressioriskiä.
- Täysin kypsässä SaaS-tuotteessa kirjauslogiikan lähde olisi mahdollisimman keskitetty.

### 3.3 Operatiivinen SaaS-valmius
- Puuttuu tyypillisiä "SaaS-ready" kyvykkyyksiä:
  - laajempi rooli-/oikeusmalli (kirjanpitäjä, tarkastaja, asiakkaan käyttäjä)
  - audit trail (kuka muutti mitä ja milloin)
  - virhetilojen observability (alertit, dashboardit, SLA-seuranta)
  - skaalautuva ylläpitoprosessi (migrations, automaattitestit kriittisille kirjauspoluille)

## 4) Arvio kypsyystasosta (suuntaa-antava)

- Prosessien toimivuus (päivittäiskäyttö): 7.5/10  
- Kirjauslogiikan yhtenäisyys: 6/10  
- ALV- ja viranomaisprosessin valmius: 6/10  
- SaaS-operointi ja hallittavuus: 5/10  
- Kokonaiskypsyys: ~6.5/10

## 5) Priorisoitu etenemissuunnitelma

### Vaihe A - Pakollinen ennen laajaa käyttöä
1. Varmista, että kaikki myynti/osto/pankki-polut käyttävät samaa ALV-tilimallia.  
2. Lukitse ALV-kuukausikirjauksen laskentakaava ja testitapaukset.  
3. Lisää regressiotestit kriittisille poluille (BA, ALV-siirto, liitteet).

### Vaihe B - Seuraava tuoteharppaus
1. 3 kk ja vuosi ALV-kausituki.  
2. Maksamaton/maksettu ALV-erien selkeä erottelu etusivulle.  
3. Kirjauslogiikan keskitys yhteen lähdemoduuliin.

### Vaihe C - SaaS-kovennus
1. Audit trail + muutoslokit.  
2. Käyttäjäroolit ja hyväksyntäpolut.  
3. Operointimittarit, hälytykset ja release-kuri.

## 6) Johtopäätös

Adepta PPR on nyt hyvin lähellä käytännön taloushallinnon "ydinkäyttöä" ja kehitys on ollut nopeaa.  
Täysin toimivan SaaS-järjestelmän tasoon suurin jäljellä oleva askel on ALV-prosessin loppuun koventaminen ja koko kirjausketjun regressioturva.

