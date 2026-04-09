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

        // Hae toimittajan oletus kirjaustili
        let ostoTili = '4000'
        // Hae lähettäjä toimittajarekisteristä OVT-tunnuksella (yksilöivin tunniste)
        // Lähettäjän OVT on tallennettu kirjanpitoasiakas.ovt_tunnus
        const { data: lahettajanTiedot } = await supabaseAdmin!
          .from('ppr_kirjanpitoasiakkaat')
          .select('nimi, ovt_tunnus, y_tunnus')
          .eq('id', lasku.kirjanpitoasiakas_id)
          .maybeSingle()

        const { data: toimittaja } = await supabaseAdmin!
          .from('ppr_toimittajat')
          .select('id, ppr_toimittaja_oletukset(kirjanpitoasiakas_id, tili, kayttokerrat)')
          .eq('ovt_tunnus', lahettajanTiedot?.ovt_tunnus || '__EI_OVT__')
          .maybeSingle()

        if (toimittaja) {
          const asiakasOletus = (toimittaja.ppr_toimittaja_oletukset as any[])
            ?.find((o: any) => o.kirjanpitoasiakas_id === vastaanottaja.id)
          const globaaliOletus = (toimittaja.ppr_toimittaja_oletukset as any[])
            ?.sort((a: any, b: any) => b.kayttokerrat - a.kayttokerrat)[0]
          ostoTili = asiakasOletus?.tili || globaaliOletus?.tili || '4000'

          // Päivitä käyttökerrat
          await supabaseAdmin!.from('ppr_toimittaja_tilastot')
            .upsert({ toimittaja_id: toimittaja.id, tili: ostoTili, kayttokerrat: 1 }, { onConflict: 'toimittaja_id,tili' })
        } else if (lasku.kirjanpitoasiakas_ytunnus) {
          // Luo toimittaja automaattisesti
          const { data: uusiToimittaja } = await supabaseAdmin!
            .from('ppr_toimittajat')
            .insert({
              nimi: lasku.asiakas_nimi,
              ytunnus: lasku.kirjanpitoasiakas_ytunnus,
              ovt_tunnus: lasku.asiakas_ovt_tunnus || null,
            })
            .select('id')
            .single()
          if (uusiToimittaja) {
            await supabaseAdmin!.from('ppr_toimittaja_tilastot')
              .insert({ toimittaja_id: uusiToimittaja.id, tili: '4000', kayttokerrat: 1 })
          }
        }

        // Luo ostolasku hyväksyntäkiertoon suoran kirjauksen sijaan
        const { data: olData, error: olErr } = await supabaseAdmin!
          .from('ppr_ostolaskut')
          .insert({
            kirjanpitoasiakas_id: vastaanottaja.id,
            toimittaja_nimi: (lahettajanTiedot as any)?.nimi || lasku.asiakas_nimi || 'Tuntematon',
            toimittaja_id: toimittaja?.id || null,
            lasku_nro: null,
            toimittajan_lasku_nro: tositeNro,
            pvm: lasku.pvm,
            erapv: lasku.erapv || null,
            viite: lasku.viite || null,
            summa_netto: Math.round(kokonaisNetto * 100) / 100,
            summa_alv: Math.round((brutto - kokonaisNetto) * 100) / 100,
            summa_brutto: brutto,
            tila: 'saapunut',
            tosite_pdf_path: null,
          })
          .select('id')
          .single()

        if (olErr) {
          console.error('Ostolasku insert epäonnistui:', olErr.message)
        } else {
          // Kopioi myyntilaskun rivit ostolaskun riveiksi
          const olRivitInsert = (rivit || []).map((r: any) => ({
            lasku_id: olData.id,
            selite: r.tuote_nimi || r.selite || lasku.asiakas_nimi,
            tili: ostoTili,
            alv_prosentti: Number(r.alv_prosentti) || 0,
            netto: Number(r.summa_netto) || 0,
            alv: Math.round((Number(r.summa_yhteensa) - Number(r.summa_netto)) * 100) / 100,
            brutto: Number(r.summa_yhteensa) || 0,
          }))
          if (olRivitInsert.length > 0) {
            await supabaseAdmin!.from('ppr_ostolasku_rivit').insert(olRivitInsert)
          }
          console.log('Ostolasku luotu hyväksyntäkiertoon:', olData.id)
        }
      }
    }

    return NextResponse.json({ ...laskuData, tosite_nro: tositeNro }, { status: 201 })
  } catch (e: any) {
    console.error('myyntilaskut POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
