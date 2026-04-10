import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

type ApplyBody = {
  asiakas_id: string
  tapahtuma: any
  suggestion?: any
  tosite_nro?: number
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })
    const body = (await request.json()) as ApplyBody
    if (!body?.asiakas_id || !body?.tapahtuma) {
      return NextResponse.json({ error: 'asiakas_id ja tapahtuma vaaditaan' }, { status: 400 })
    }

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id')
      .eq('auth_sub', session.user.sub)
      .maybeSingle()

    const t = body.tapahtuma
    const vak = t.vak || (t.vtNro ? { vt: t.vtNro, alv: t.alvp || 0 } : null)
    if (!vak?.vt) return NextResponse.json({ error: 'vastatili puuttuu' }, { status: 400 })

    const summa = Number(t.summa) || 0
    if (!summa) return NextResponse.json({ error: 'summa puuttuu' }, { status: 400 })
    const pos = summa > 0
    const alvp = Number(vak.alv || 0)
    const brutto = Math.abs(summa)
    const netto = alvp > 0 ? brutto / (1 + alvp / 100) : brutto
    const alv = brutto - netto
    const selite = (t.maksu && t.maksu !== t.sel) ? `${t.sel} — ${t.maksu}` : (t.sel || 'Pankkitapahtuma')

    let tositeNro = body.tosite_nro
    if (!tositeNro) {
      const { data: next, error: nextErr } = await supabaseAdmin!
        .rpc('seuraava_tosite_nro', { p_asiakas_id: body.asiakas_id, p_laji: 'MU' })
      if (nextErr) return NextResponse.json({ error: nextErr.message }, { status: 500 })
      tositeNro = Number(next)
    }

    const rivit: any[] = []
    if (pos) {
      rivit.push({ tili: '1910', selite, saldo: brutto, alv_prosentti: null })
      if (alvp > 0) {
        rivit.push({ tili: vak.vt, selite, saldo: -netto, alv_prosentti: alvp })
        rivit.push({ tili: '29390', selite: `ALV ${alvp}%`, saldo: -alv, alv_prosentti: null })
      } else {
        rivit.push({ tili: vak.vt, selite, saldo: -brutto, alv_prosentti: null })
      }
    } else {
      if (alvp > 0) {
        rivit.push({ tili: vak.vt, selite, saldo: netto, alv_prosentti: alvp })
        rivit.push({ tili: '1763', selite: `ALV ${alvp}%`, saldo: alv, alv_prosentti: null })
        rivit.push({ tili: '1910', selite, saldo: -brutto, alv_prosentti: null })
      } else {
        rivit.push({ tili: vak.vt, selite, saldo: brutto, alv_prosentti: null })
        rivit.push({ tili: '1910', selite, saldo: -brutto, alv_prosentti: null })
      }
    }

    const insert = rivit.map(r => ({
      asiakas_id: body.asiakas_id,
      tosite_nro: tositeNro,
      paivamaara: t.arvopv || t.kirjpv || new Date().toISOString().slice(0, 10),
      tili: r.tili,
      selite: r.selite,
      saldo: r.saldo,
      alv_prosentti: r.alv_prosentti,
      luonut_kayttaja_id: kayttaja?.id ?? null,
    }))
    const { error: insErr } = await supabaseAdmin!.from('ppr_paivakirja').insert(insert)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, tosite_nro: tositeNro, rivit: insert.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'apply failed' }, { status: 500 })
  }
}
