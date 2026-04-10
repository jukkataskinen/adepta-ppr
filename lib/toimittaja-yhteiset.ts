import type { SupabaseClient } from '@supabase/supabase-js'

/** Suomalainen Y-tunnus muotoon 1234567-8 */
export function normalisoiYtunnus(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  let s = raw.replace(/\s/g, '').toUpperCase()
  if (s.startsWith('FI')) s = s.slice(2)
  if (/^\d{8}$/.test(s)) s = `${s.slice(0, 7)}-${s.slice(7)}`
  if (/^\d{7}-\d$/.test(s)) return s
  return null
}

/** OVT: vain numerot, vähintään 8 merkkiä */
export function normalisoiOvt(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.replace(/\D/g, '')
  return s.length >= 8 ? s : null
}

export function pyoristaAlvProsentti(alv: number): number {
  return Math.round(Number(alv) * 100) / 100
}

/** Yksi avain bumpia varten: Y-tunnus voittaa OVT:n (vältetään tupla-aggregointi). */
export function parasYhteinenBumpAvain(
  ytunnus?: string | null,
  ovt?: string | null
): { laji: 'ytunnus' | 'ovt'; avain: string } | null {
  const y = normalisoiYtunnus(ytunnus)
  if (y) return { laji: 'ytunnus', avain: y }
  const o = normalisoiOvt(ovt)
  if (o) return { laji: 'ovt', avain: o }
  return null
}

export type YhteinenEhdotus = {
  tili: string
  alv_prosentti: number
  kayttokerrat: number
  lahde_avain_laji: 'ytunnus' | 'ovt'
}

type YhteinenRivi = {
  avain: string
  avain_laji: string
  tili: string
  alv_prosentti: number
  kayttokerrat: number
}

function valitseParasEhdotus(rivit: YhteinenRivi[]): YhteinenEhdotus | null {
  if (!rivit.length) return null
  const paras = rivit.reduce((a, b) => (b.kayttokerrat > a.kayttokerrat ? b : a))
  if (paras.avain_laji !== 'ytunnus' && paras.avain_laji !== 'ovt') return null
  return {
    tili: String(paras.tili || '').trim(),
    alv_prosentti: pyoristaAlvProsentti(Number(paras.alv_prosentti) || 0),
    kayttokerrat: Number(paras.kayttokerrat) || 0,
    lahde_avain_laji: paras.avain_laji,
  }
}

/** Paras tunnettu tili toimittajalle: vertaa sekä Y-tunnusta että OVT:ta, valitse eniten käytetty. */
export async function haeYhteinenParasTili(
  supabase: SupabaseClient,
  ytunnus?: string | null,
  ovt?: string | null
): Promise<YhteinenEhdotus | null> {
  const y = normalisoiYtunnus(ytunnus)
  const o = normalisoiOvt(ovt)
  const kaikki: YhteinenRivi[] = []
  if (y) {
    const t = await supabase
      .from('ppr_toimittaja_yhteiset_tilastot')
      .select('avain, avain_laji, tili, alv_prosentti, kayttokerrat')
      .eq('avain_laji', 'ytunnus')
      .eq('avain', y)
    if (t.error) console.warn('[toimittaja-yhteiset] hae:', t.error.message)
    else kaikki.push(...((t.data as YhteinenRivi[]) || []))
  }
  if (o) {
    const t = await supabase
      .from('ppr_toimittaja_yhteiset_tilastot')
      .select('avain, avain_laji, tili, alv_prosentti, kayttokerrat')
      .eq('avain_laji', 'ovt')
      .eq('avain', o)
    if (t.error) console.warn('[toimittaja-yhteiset] hae:', t.error.message)
    else kaikki.push(...((t.data as YhteinenRivi[]) || []))
  }
  if (!kaikki.length) return null
  return valitseParasEhdotus(kaikki)
}

export async function bumpToimittajaYhteinenTili(
  supabase: SupabaseClient,
  params: {
    ytunnus?: string | null
    ovt?: string | null
    tili: string
    alv_prosentti?: number | null
  }
): Promise<void> {
  const bump = parasYhteinenBumpAvain(params.ytunnus, params.ovt)
  if (!bump) return
  const tili = String(params.tili || '').trim()
  if (!tili) return
  const alv = pyoristaAlvProsentti(Number(params.alv_prosentti ?? 0))
  try {
    const { error } = await supabase.rpc('ppr_bump_toimittaja_yhteinen_tili', {
      p_avain: bump.avain,
      p_avain_laji: bump.laji,
      p_tili: tili,
      p_alv_prosentti: alv,
    })
    if (error) console.warn('[toimittaja-yhteiset] bump:', error.message)
  } catch (e) {
    console.warn('[toimittaja-yhteiset] bump:', e)
  }
}

/** Liittää kentän yhteinen_ehdotus jokaiselle toimittajariville (batch-haulla). */
export async function enrichToimittajatYhteisillaEhdotuksilla(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (!rows.length) return
  const yt = new Set<string>()
  const ov = new Set<string>()
  for (const t of rows) {
    const y = normalisoiYtunnus(t.ytunnus as string | null | undefined)
    const o = normalisoiOvt(t.ovt_tunnus as string | null | undefined)
    if (y) yt.add(y)
    if (o) ov.add(o)
  }

  const yLista = Array.from(yt)
  const oLista = Array.from(ov)
  const yRes = yLista.length
    ? await supabase
        .from('ppr_toimittaja_yhteiset_tilastot')
        .select('avain, avain_laji, tili, alv_prosentti, kayttokerrat')
        .eq('avain_laji', 'ytunnus')
        .in('avain', yLista)
    : { data: [] as YhteinenRivi[], error: null }
  const oRes = oLista.length
    ? await supabase
        .from('ppr_toimittaja_yhteiset_tilastot')
        .select('avain, avain_laji, tili, alv_prosentti, kayttokerrat')
        .eq('avain_laji', 'ovt')
        .in('avain', oLista)
    : { data: [] as YhteinenRivi[], error: null }

  if (yRes.error) console.warn('[toimittaja-yhteiset] enrich yt:', yRes.error.message)
  if (oRes.error) console.warn('[toimittaja-yhteiset] enrich ovt:', oRes.error.message)

  const parhaatY = new Map<string, YhteinenRivi>()
  const parhaatO = new Map<string, YhteinenRivi>()
  for (const r of (yRes.data as YhteinenRivi[]) || []) {
    const cur = parhaatY.get(r.avain)
    if (!cur || r.kayttokerrat > cur.kayttokerrat) parhaatY.set(r.avain, r)
  }
  for (const r of (oRes.data as YhteinenRivi[]) || []) {
    const cur = parhaatO.get(r.avain)
    if (!cur || r.kayttokerrat > cur.kayttokerrat) parhaatO.set(r.avain, r)
  }

  for (const t of rows) {
    const yk = normalisoiYtunnus(t.ytunnus as string | null | undefined)
    const ok = normalisoiOvt(t.ovt_tunnus as string | null | undefined)
    const cands: YhteinenRivi[] = []
    if (yk) {
      const r = parhaatY.get(yk)
      if (r) cands.push(r)
    }
    if (ok) {
      const r = parhaatO.get(ok)
      if (r) cands.push(r)
    }
    const paras = valitseParasEhdotus(cands)
    ;(t as { yhteinen_ehdotus?: YhteinenEhdotus | null }).yhteinen_ehdotus = paras
  }
}

/** Suurimman bruton mukainen rivi (ostolaskun kirjausvahvistus). */
export function dominanttiOstolaskuRivi(rivit: { brutto?: unknown; tili?: unknown; alv_prosentti?: unknown }[] | null | undefined): {
  tili: string
  alv_prosentti: number
} | null {
  if (!rivit?.length) return null
  let best = rivit[0]
  let bestB = Number(best.brutto) || 0
  for (let i = 1; i < rivit.length; i++) {
    const b = Number(rivit[i].brutto) || 0
    if (b > bestB) {
      best = rivit[i]
      bestB = b
    }
  }
  const tili = String(best.tili || '').trim()
  if (!tili) return null
  return { tili, alv_prosentti: pyoristaAlvProsentti(Number(best.alv_prosentti) || 0) }
}
