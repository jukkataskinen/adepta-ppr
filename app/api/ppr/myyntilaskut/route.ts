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
      .select('*, tosite_pdf_path, rivit:ppr_myyntilasku_rivit(*)')
      .eq('kirjanpitoasiakas_id', asiakas_id)
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
      const rivitInsert = rivit.map((r: any) => ({
        lasku_id: laskuData.id,
        tuote_id: r.tuote_id ?? null,
        tuote_nimi: r.tuote_nimi ?? null,
        selite: r.selite ?? null,
        maara: r.maara ?? 1,
        yksikko: r.yksikko ?? 'kpl',
        a_hinta: r.a_hinta ?? 0,
        alv_prosentti: r.alv_prosentti ?? 0,
        summa_netto: r.summa_netto ?? 0,
        summa_yhteensa: r.summa_yhteensa ?? 0,
      }))
      const { error: rivitErr } = await supabaseAdmin!.from('ppr_myyntilasku_rivit').insert(rivitInsert)
      if (rivitErr) return NextResponse.json({ error: 'Rivit: ' + rivitErr.message }, { status: 500 })
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

    const tositeNro = 'ML' + lasku.lasku_nro
    const { error: pvkErr } = await supabaseAdmin!.from('ppr_paivakirja').insert(tositeRivit.map(r => ({
      asiakas_id: lasku.kirjanpitoasiakas_id,
      tosite_nro: tositeNro,
      paivamaara: lasku.pvm,
      tili: r.tili, selite: r.selite, saldo: r.saldo,
      alv_prosentti: null, luonut_kayttaja_id: kayttaja?.id ?? null,
    })))
    if (pvkErr) return NextResponse.json({ error: 'Paivakirja: ' + pvkErr.message }, { status: 500 })

    // Päivitä tosite_nro myyntilaskuun
    await supabaseAdmin!.from('ppr_myyntilaskut')
      .update({ tosite_nro: tositeNro })
      .eq('id', laskuData.id)

    // Tarkista onko vastaanottaja PPR-asiakas (sisäinen lasku)
    if (lasku.asiakas_ovt_tunnus) {
      const { data: vastaanottaja } = await supabaseAdmin!
        .from('ppr_kirjanpitoasiakkaat')
        .select('id, organisaatio_id')
        .eq('ovt_tunnus', lasku.asiakas_ovt_tunnus)
        .maybeSingle()

      if (vastaanottaja) {
        const olNro = 'OL' + lasku.lasku_nro
        const alvTilit: Record<number, string> = { 25.5: '1763', 14: '1764', 10: '1765' }

        const alvRyhmat: Record<number, { netto: number, alv: number }> = {}
        let kokonaisNetto = 0
        ;(rivit || []).forEach((r: any) => {
          const alvP = Number(r.alv_prosentti) || 0
          const rNetto = Number(r.summa_netto) || 0
          const rAlv = Number(r.summa_yhteensa) - rNetto
          kokonaisNetto += rNetto
          if (!alvRyhmat[alvP]) alvRyhmat[alvP] = { netto: 0, alv: 0 }
          alvRyhmat[alvP].netto += rNetto
          alvRyhmat[alvP].alv += rAlv
        })

        const olRivit: any[] = []
        const selite = 'Ostolasku ' + lasku.asiakas_nimi + ' ' + tositeNro
        const base = { asiakas_id: vastaanottaja.id, tosite_nro: olNro, paivamaara: lasku.pvm, luonut_kayttaja_id: kayttaja?.id ?? null }

        olRivit.push({ ...base, tili: '4000', selite, saldo: Math.round(kokonaisNetto * 100) / 100, alv_prosentti: null })

        Object.entries(alvRyhmat).forEach(([alvP, summat]) => {
          const alvNum = Number(alvP)
          const alvTili = alvTilit[alvNum]
          if (alvTili && summat.alv > 0.01) {
            olRivit.push({ ...base, tili: alvTili, selite: selite + ' ALV ' + alvP + '%', saldo: Math.round(summat.alv * 100) / 100, alv_prosentti: alvNum })
          }
        })

        olRivit.push({ ...base, tili: '2871', selite, saldo: -brutto, alv_prosentti: null })

        const { error: olErr } = await supabaseAdmin!.from('ppr_paivakirja').insert(olRivit)
        if (olErr) console.error('Sisäinen OL-tosite epäonnistui:', olErr.message)
        else console.log('Sisäinen lasku luotu:', vastaanottaja.id, olNro, olRivit.length, 'riviä')
      }
    }

    return NextResponse.json({ ...laskuData, tosite_nro: tositeNro }, { status: 201 })
  } catch (e: any) {
    console.error('myyntilaskut POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
