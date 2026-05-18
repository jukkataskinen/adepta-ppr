-- =====================================================
-- VAIHE 8: Seed-toistuvuudet testiasiakkaalle Konekorjaamo Simo Kärnä
-- Ohittaa hiljaisesti jos asiakasta tai pohjia ei löydy.
-- =====================================================
do $$
declare
  v_asiakas_id uuid;
  v_pohja_kirjanpito uuid;
  v_pohja_alv uuid;
  v_pohja_tilinpaatos uuid;
begin
  -- Etsi Konekorjaamo Simo Kärnä (osittainen haku nimellä)
  select id into v_asiakas_id
    from ppr_kirjanpitoasiakkaat
    where nimi ilike '%konekorjaamo%' or nimi ilike '%kärnä%'
    limit 1;

  if v_asiakas_id is null then
    raise notice 'Konekorjaamo-asiakasta ei löydy — ohitetaan seed-toistuvuudet';
    return;
  end if;

  -- Hae pohjat nimellä
  select id into v_pohja_kirjanpito from ppr_tyo_pohjat where nimi = 'Kuukausikirjanpito' limit 1;
  select id into v_pohja_alv from ppr_tyo_pohjat where nimi = 'ALV-ilmoitus' limit 1;
  select id into v_pohja_tilinpaatos from ppr_tyo_pohjat where nimi = 'Tilinpäätös' limit 1;

  -- 1. Kuukausikirjanpito: kuukausittain, kuukauden_paiva=20, deadline_offset on pohjassa (+20pv)
  if v_pohja_kirjanpito is not null then
    insert into ppr_toistuvuudet (
      asiakas_id, pohja_id, frekvenssi, intervalli,
      kuukauden_paiva, alkupvm, seuraava_luonti_pvm, luo_paivia_etukateen
    ) values (
      v_asiakas_id, v_pohja_kirjanpito, 'kuukausittain', 1,
      1, '2026-01-01', '2026-06-01', 7
    ) on conflict do nothing;
  end if;

  -- 2. ALV-ilmoitus: kuukausittain, kuukauden_paiva=12
  if v_pohja_alv is not null then
    insert into ppr_toistuvuudet (
      asiakas_id, pohja_id, frekvenssi, intervalli,
      kuukauden_paiva, alkupvm, seuraava_luonti_pvm, luo_paivia_etukateen
    ) values (
      v_asiakas_id, v_pohja_alv, 'kuukausittain', 1,
      12, '2026-01-01', '2026-06-12', 7
    ) on conflict do nothing;
  end if;

  -- 3. Tilinpäätös: vuosittain, kuukaudet=[4], kuukauden_paiva=30
  if v_pohja_tilinpaatos is not null then
    insert into ppr_toistuvuudet (
      asiakas_id, pohja_id, frekvenssi, intervalli,
      kuukauden_paiva, kuukaudet, alkupvm, seuraava_luonti_pvm, luo_paivia_etukateen
    ) values (
      v_asiakas_id, v_pohja_tilinpaatos, 'vuosittain', 1,
      30, array[4], '2026-01-01', '2026-04-30', 60
    ) on conflict do nothing;
  end if;

  raise notice 'Konekorjaamo-toistuvuudet seedattu asiakkaalle %', v_asiakas_id;
end $$;
