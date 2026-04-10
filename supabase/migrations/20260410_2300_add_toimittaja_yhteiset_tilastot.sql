-- Rajat ylittävä (saman DB:n kaikki organisaatiot) toimittaja → tili -aggregaatti.
-- Avain: normalisoitu Y-tunnus tai OVT (ei nimi).

CREATE TABLE IF NOT EXISTS ppr_toimittaja_yhteiset_tilastot (
  avain text NOT NULL,
  avain_laji text NOT NULL CHECK (avain_laji IN ('ytunnus', 'ovt')),
  tili text NOT NULL,
  alv_prosentti numeric(8, 2) NOT NULL DEFAULT 25.5,
  kayttokerrat bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (avain, avain_laji, tili, alv_prosentti)
);

CREATE INDEX IF NOT EXISTS idx_ppr_toim_yhteiset_avain_laji
  ON ppr_toimittaja_yhteiset_tilastot (avain_laji, avain, kayttokerrat DESC);

COMMENT ON TABLE ppr_toimittaja_yhteiset_tilastot IS
  'Aggregoitu: kuinka usein tiettyä tiliä on käytetty toimittajalle (Y-tunnus tai OVT) kaikissa organisaatioissa. Päivitetään palvelimelta.';

CREATE OR REPLACE FUNCTION ppr_bump_toimittaja_yhteinen_tili(
  p_avain text,
  p_avain_laji text,
  p_tili text,
  p_alv_prosentti numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_avain IS NULL OR length(trim(p_avain)) < 4 THEN
    RETURN;
  END IF;
  IF p_avain_laji NOT IN ('ytunnus', 'ovt') THEN
    RETURN;
  END IF;
  IF p_tili IS NULL OR length(trim(p_tili)) < 1 THEN
    RETURN;
  END IF;

  INSERT INTO ppr_toimittaja_yhteiset_tilastot (avain, avain_laji, tili, alv_prosentti, kayttokerrat, updated_at)
  VALUES (trim(p_avain), p_avain_laji, trim(p_tili), COALESCE(p_alv_prosentti, 0), 1, now())
  ON CONFLICT (avain, avain_laji, tili, alv_prosentti)
  DO UPDATE SET
    kayttokerrat = ppr_toimittaja_yhteiset_tilastot.kayttokerrat + 1,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION ppr_bump_toimittaja_yhteinen_tili(text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ppr_bump_toimittaja_yhteinen_tili(text, text, text, numeric) TO service_role;
