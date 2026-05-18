import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')
    const status = searchParams.get('status')
    const vastuuhenkilo = searchParams.get('vastuuhenkilo')
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000)
    const offset = parseInt(searchParams.get('offset') || '0')

    let q = supabaseAdmin!
      .from('ppr_tyot')
      .select(`
        id, asiakas_id, toistuvuus_id, pohja_id,
        tyyppi, otsikko, kuvaus, status, prioriteetti,
        vastuuhenkilo_email, deadline, kausi, arvio_h, toteutunut_h,
        jarjestys, luotu, paivitetty, luoja_email,
        ppr_tyo_tehtavat ( id, otsikko, valmis, jarjestys ),
        ppr_kirjanpitoasiakkaat ( id, nimi )
      `, { count: 'exact' })
      .order('jarjestys')
      .order('deadline', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (asiakas_id) q = q.eq('asiakas_id', asiakas_id)
    if (status) q = q.eq('status', status)
    if (vastuuhenkilo) q = q.eq('vastuuhenkilo_email', vastuuhenkilo)

    const { data, error, count } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [], total: count, limit, offset })
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
      asiakas_id, tyyppi, otsikko, kuvaus, prioriteetti,
      vastuuhenkilo_email, deadline, kausi, arvio_h, tehtavat
    } = body

    if (!asiakas_id || !tyyppi || !otsikko) {
      return NextResponse.json({ error: 'asiakas_id, tyyppi ja otsikko vaaditaan' }, { status: 400 })
    }

    const { data: tyo, error } = await supabaseAdmin!
      .from('ppr_tyot')
      .insert({
        asiakas_id,
        tyyppi,
        otsikko,
        kuvaus,
        status: 'jonossa',
        prioriteetti: prioriteetti || 'normaali',
        vastuuhenkilo_email,
        deadline,
        kausi,
        arvio_h,
        luoja_email: session.user.email,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Lisää tehtävät jos annettu
    if (tehtavat?.length && tyo) {
      await supabaseAdmin!
        .from('ppr_tyo_tehtavat')
        .insert(tehtavat.map((t: { otsikko: string }, i: number) => ({
          tyo_id: tyo.id,
          otsikko: t.otsikko,
          jarjestys: i,
        })))
    }

    return NextResponse.json({ ok: true, id: tyo.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
