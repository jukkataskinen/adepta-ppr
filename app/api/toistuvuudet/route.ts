import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')

    let q = supabaseAdmin!
      .from('ppr_toistuvuudet')
      .select(`
        id, asiakas_id, pohja_id, vastuuhenkilo_email,
        frekvenssi, intervalli, viikonpaivat, kuukauden_paiva, kuukaudet,
        rrule_lauseke, alkupvm, loppupvm, seuraava_luonti_pvm,
        luo_paivia_etukateen, aktiivinen, luotu, paivitetty,
        ppr_tyo_pohjat ( id, nimi, tyyppi )
      `)
      .order('luotu', { ascending: false })

    if (asiakas_id) q = q.eq('asiakas_id', asiakas_id)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const {
      asiakas_id, pohja_id, vastuuhenkilo_email,
      frekvenssi, intervalli, viikonpaivat, kuukauden_paiva, kuukaudet,
      rrule_lauseke, alkupvm, loppupvm, seuraava_luonti_pvm, luo_paivia_etukateen
    } = body

    if (!asiakas_id || !pohja_id || !frekvenssi || !alkupvm || !seuraava_luonti_pvm) {
      return NextResponse.json({ error: 'asiakas_id, pohja_id, frekvenssi, alkupvm ja seuraava_luonti_pvm vaaditaan' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .insert({
        asiakas_id, pohja_id, vastuuhenkilo_email,
        frekvenssi, intervalli: intervalli || 1,
        viikonpaivat, kuukauden_paiva, kuukaudet,
        rrule_lauseke, alkupvm, loppupvm,
        seuraava_luonti_pvm, luo_paivia_etukateen: luo_paivia_etukateen || 14,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
