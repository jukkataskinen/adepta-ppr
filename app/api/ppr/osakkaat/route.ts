import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const kirjanpitoasiakas_id = searchParams.get('kirjanpitoasiakas_id')
    if (!kirjanpitoasiakas_id) return NextResponse.json({ error: 'kirjanpitoasiakas_id vaaditaan' }, { status: 400 })

    // Varmista kirjanpitoasiakas kuuluu organisaatioon
    const { data: ka } = await supabaseAdmin!
      .from('ppr_asiakkaat')
      .select('id')
      .eq('id', kirjanpitoasiakas_id)
      .eq('organisaatio_id', kayttaja.organisaatio_id)
      .maybeSingle()
    if (!ka) return NextResponse.json({ error: 'Ei oikeutta' }, { status: 403 })

    // Hae osakkaat + reskontra-yhteenveto
    const { data: osakkaat, error } = await supabaseAdmin!
      .from('ppr_osakkaat')
      .select('*')
      .eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id)
      .order('nimi')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Laske avoin_summa ja laskujen_maara per osakas
    const { data: reskontra } = await supabaseAdmin!
      .from('ppr_reskontra')
      .select('osakas_id, summa, tila')
      .eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id)

    const tilastot: Record<string, { laskuja: number; avoin: number; maksettu: number }> = {}
    ;(reskontra || []).forEach((r: any) => {
      if (!r.osakas_id) return
      if (!tilastot[r.osakas_id]) tilastot[r.osakas_id] = { laskuja: 0, avoin: 0, maksettu: 0 }
      tilastot[r.osakas_id].laskuja++
      const s = Number(r.summa) || 0
      if (r.tila === 'maksettu') tilastot[r.osakas_id].maksettu += s
      else tilastot[r.osakas_id].avoin += s
    })

    const tulos = (osakkaat || []).map((o: any) => ({
      ...o,
      laskuja: tilastot[o.id]?.laskuja || 0,
      avoin_summa: tilastot[o.id]?.avoin || 0,
      maksettu_summa: tilastot[o.id]?.maksettu || 0,
    }))

    return NextResponse.json(tulos)
  } catch (e: any) {
    console.error('osakkaat GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const body = await request.json()
    const { kirjanpitoasiakas_id, nimi, katuosoite, postinro, kaupunki } = body
    if (!kirjanpitoasiakas_id || !nimi) return NextResponse.json({ error: 'kirjanpitoasiakas_id ja nimi vaaditaan' }, { status: 400 })

    // Upsert: luo tai päivitä osoite
    const { data: existing } = await supabaseAdmin!
      .from('ppr_osakkaat')
      .select('id')
      .eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id)
      .eq('nimi', nimi)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin!
        .from('ppr_osakkaat')
        .update({ katuosoite: katuosoite || null, postinro: postinro || null, kaupunki: kaupunki || null })
        .eq('id', existing.id)
      return NextResponse.json(existing)
    }

    const { data, error } = await supabaseAdmin!
      .from('ppr_osakkaat')
      .insert({ kirjanpitoasiakas_id, nimi, katuosoite: katuosoite || null, postinro: postinro || null, kaupunki: kaupunki || null })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    console.error('osakkaat POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
