import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')
    if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })
    const { data, error } = await supabaseAdmin!
      .from('ppr_myyntilaskut')
      .select('*, rivit:ppr_myyntilasku_rivit(*)')
      .eq('asiakas_id', asiakas_id)
      .order('lasku_nro', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!.from('ppr_kayttajat').select('id').eq('auth_sub', session.user.sub).single()
    const body = await request.json()
    const { rivit, ...lasku } = body

    // Tallenna lasku
    const { data: laskuData, error: laskuErr } = await supabaseAdmin!
      .from('ppr_myyntilaskut').insert(lasku).select().single()
    if (laskuErr) return NextResponse.json({ error: laskuErr.message }, { status: 500 })

    // Tallenna rivit
    if (rivit?.length) {
      const rivitInsert = rivit.map((r: any) => ({ ...r, lasku_id: laskuData.id }))
      const { error: rivitErr } = await supabaseAdmin!.from('ppr_myyntilasku_rivit').insert(rivitInsert)
      if (rivitErr) console.warn('Rivit:', rivitErr)
    }

    // Luo ML-tosite kirjanpitoon
    const brutto = rivit?.reduce((s: number, r: any) => s + (Number(r.summa_yhteensa) || 0), 0) || 0
    const netto = rivit?.reduce((s: number, r: any) => s + (Number(r.summa_netto) || 0), 0) || 0
    const alv = brutto - netto
    const tositeRivit = [
      { tili: '1701', selite: 'Myyntilasku ' + lasku.lasku_nro + ' ' + (lasku.asiakas_nimi || ''), saldo: brutto },
      { tili: '3000', selite: 'Myynti ML' + lasku.lasku_nro, saldo: -netto },
    ]
    if (alv > 0.01) tositeRivit.push({ tili: '29390', selite: 'Myynti-ALV ML' + lasku.lasku_nro, saldo: -alv })

    await supabaseAdmin!.from('ppr_paivakirja').insert(tositeRivit.map(r => ({
      asiakas_id: lasku.asiakas_id,
      tosite_nro: 'ML' + lasku.lasku_nro,
      paivamaara: lasku.laskupaiva,
      tili: r.tili, selite: r.selite, saldo: r.saldo,
      alv_prosentti: null, luonut_kayttaja_id: kayttaja?.id ?? null,
    })))

    return NextResponse.json(laskuData, { status: 201 })
  } catch (e: any) {
    console.error('myyntilaskut POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
