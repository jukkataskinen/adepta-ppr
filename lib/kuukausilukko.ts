import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalisoi päivämäärän yyyy-mm-muotoon (ISO etuliite). */
export function paivamaaraToYyyyMm(paivamaara: string): string | null {
  const s = String(paivamaara || '').trim().slice(0, 10)
  if (s.length < 7) return null
  return s.slice(0, 7)
}

export function yyyyMmCompare(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function addMonths(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  const d = new Date(y, m - 1 + delta, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

/** Kuukaudet [startYm, endYm) — molemmat yyyy-mm. */
export function monthsRangeExclusive(startYm: string, endYm: string): string[] {
  if (yyyyMmCompare(startYm, endYm) >= 0) return []
  const out: string[] = []
  let cur = startYm
  while (yyyyMmCompare(cur, endYm) < 0) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

export async function haeLukitutKuukaudet(
  supabase: SupabaseClient,
  asiakasId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('ppr_kirjanpito_kuukausilukot')
    .select('yyyy_mm')
    .eq('asiakas_id', asiakasId)
  if (error) throw new Error(error.message)
  const set = new Set((data || []).map((r: { yyyy_mm: string }) => String(r.yyyy_mm)))
  return Array.from(set).sort(yyyyMmCompare)
}

export async function onkoKuukausiLukittu(
  supabase: SupabaseClient,
  asiakasId: string,
  yyyyMm: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ppr_kirjanpito_kuukausilukot')
    .select('id')
    .eq('asiakas_id', asiakasId)
    .eq('yyyy_mm', yyyyMm)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

/** Ensimmäinen kuukausi jolla on joko päiväkirjaa tai ostolaskua. */
export async function haeEnsimmainenToimintakuukausi(
  supabase: SupabaseClient,
  asiakasId: string
): Promise<string | null> {
  const { data: pv } = await supabase
    .from('ppr_paivakirja')
    .select('paivamaara')
    .eq('asiakas_id', asiakasId)
    .order('paivamaara', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: ol } = await supabase
    .from('ppr_ostolaskut')
    .select('pvm')
    .eq('kirjanpitoasiakas_id', asiakasId)
    .order('pvm', { ascending: true })
    .limit(1)
    .maybeSingle()

  const yms: string[] = []
  const y1 = paivamaaraToYyyyMm((pv as { paivamaara?: string } | null)?.paivamaara || '')
  const y2 = paivamaaraToYyyyMm((ol as { pvm?: string } | null)?.pvm || '')
  if (y1) yms.push(y1)
  if (y2) yms.push(y2)
  if (!yms.length) return null
  yms.sort(yyyyMmCompare)
  return yms[0]
}

export type LukitusValidointi =
  | { ok: true }
  | { ok: false; syy: string }

/** Voiko kuukauden lukita järjestyksessä (kaikki edeltävät toiminnalliset kuukaudet lukittu). */
export async function validoiLukitusJarjestys(
  supabase: SupabaseClient,
  asiakasId: string,
  kohdeYyyyMm: string,
  lukitut: string[]
): Promise<LukitusValidointi> {
  const lukkoSet = new Set(lukitut)
  if (lukkoSet.has(kohdeYyyyMm)) {
    return { ok: false, syy: `Kuukausi ${kohdeYyyyMm} on jo lukittu` }
  }

  const eka = await haeEnsimmainenToimintakuukausi(supabase, asiakasId)
  if (!eka) return { ok: true }

  if (yyyyMmCompare(kohdeYyyyMm, eka) < 0) {
    return { ok: false, syy: `Ei voi lukita kuukautta ennen ensimmäistä kirjaustoimintaa (${eka})` }
  }

  const valissa = monthsRangeExclusive(eka, kohdeYyyyMm)
  for (const m of valissa) {
    if (!lukkoSet.has(m)) {
      return { ok: false, syy: `Lukitse ensin kuukausi ${m} (kuukaudet suljetaan järjestyksessä)` }
    }
  }
  return { ok: true }
}

/** Lukittujen kuukausien joukko: onko jokin päivämäärä lukitulla kuukaudella. */
export async function tarkistaPaivamaaratEivatOleLukittuja(
  supabase: SupabaseClient,
  asiakasId: string,
  paivamaarat: string[]
): Promise<{ ok: true } | { ok: false; yyyy_mm: string; viesti: string }> {
  const lukitut = await haeLukitutKuukaudet(supabase, asiakasId)
  const set = new Set(lukitut)
  for (const pv of paivamaarat) {
    const ym = paivamaaraToYyyyMm(pv)
    if (!ym) continue
    if (set.has(ym)) {
      return {
        ok: false,
        yyyy_mm: ym,
        viesti: `Kuukausi ${ym} on lukittu. Avaa kuukausi asetuksista tai valitse toinen jakso.`,
      }
    }
  }
  return { ok: true }
}

/** Saapuneet ostolaskut päiväväillä [alku, loppu], joita ei ole vielä kirjattu. */
export async function laskeKirjaamattomatOstolaskutAikavalilla(
  supabase: SupabaseClient,
  asiakasId: string,
  alkuPvm: string,
  loppuPvm: string
): Promise<number> {
  const { count, error } = await supabase
    .from('ppr_ostolaskut')
    .select('id', { count: 'exact', head: true })
    .eq('kirjanpitoasiakas_id', asiakasId)
    .gte('pvm', alkuPvm)
    .lte('pvm', loppuPvm)
    .neq('tila', 'kirjattu')

  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Saapuneet ostolaskut kuukaudella, joita ei ole vielä kirjattu. */
export async function laskeKirjaamattomatOstolaskutKuukaudella(
  supabase: SupabaseClient,
  asiakasId: string,
  yyyyMm: string
): Promise<number> {
  const alku = `${yyyyMm}-01`
  const y = Number(yyyyMm.slice(0, 4))
  const m = Number(yyyyMm.slice(5, 7))
  const loppuPvm = new Date(y, m, 0)
  const loppu = `${y}-${String(m).padStart(2, '0')}-${String(loppuPvm.getDate()).padStart(2, '0')}`
  return laskeKirjaamattomatOstolaskutAikavalilla(supabase, asiakasId, alku, loppu)
}
