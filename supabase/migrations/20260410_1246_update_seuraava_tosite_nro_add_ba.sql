-- Päivitä seuraava_tosite_nro tukemaan BA-tositelajia.
-- Turvallinen, idempotentti CREATE OR REPLACE.

create or replace function public.seuraava_tosite_nro(
  p_asiakas_id uuid,
  p_laji text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_laji text;
  v_max integer;
begin
  -- Normalisoi laji (oletus MU)
  v_laji := upper(trim(coalesce(p_laji, 'MU')));
  if v_laji = '' then
    v_laji := 'MU';
  end if;

  -- Salli kirjaimia sisältävät tositelajit (ML/OL/PA/MU/MR/BA ...)
  if v_laji !~ '^[A-Z]{2,4}$' then
    raise exception 'Virheellinen tositelaji: %', v_laji
      using errcode = '22023';
  end if;

  -- Etsi suurin käytetty juokseva numero valitulla lajilla.
  -- Muoto: <LAJI><numero>, esim. BA123
  select coalesce(max(substring(tosite_nro from ('^' || v_laji || '([0-9]+)$'))::int), 0)
    into v_max
  from public.ppr_paivakirja
  where asiakas_id = p_asiakas_id
    and tosite_nro like (v_laji || '%')
    and tosite_nro ~ ('^' || v_laji || '[0-9]+$');

  return v_laji || (v_max + 1)::text;
end;
$$;

grant execute on function public.seuraava_tosite_nro(uuid, text) to authenticated;
grant execute on function public.seuraava_tosite_nro(uuid, text) to service_role;
