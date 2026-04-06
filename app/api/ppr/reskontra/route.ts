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
    console.log('reskontra GET kayttaja:', JSON.stringify(kayttaja), 'auth_sub:', session.user.sub)

    const { searchParams } = new URL(request.url)
    const kirjanpitoasiakas_id = searchParams.get('kirjanpitoasiakas_id')
    const asiakas_id = searchParams.get('asiakas_id')
    const tila = searchParams.get('tila')

    // Varmista kirjanpitoasiakas kuuluu käyttäjän organisaatioon
    if (kirjanpitoasiakas_id) {
      const { data: asiakas } = await supabaseAdmin!
        .from('ppr_asiakkaat')
        .select('id, organisaatio_id')
        .eq('id', kirjanpitoasiakas_id)
        .eq('organisaatio_id', kayttaja.organisaatio_id)
        .maybeSingle()
      if (!asiakas) return NextResponse.json({ error: 'Kirjanpitoasiakas ei kuulu organisaatioon' }, { status: 403 })
    }

    let query = supabaseAdmin!
      .from('ppr_reskontra')
      .select('*, asiakas:asiakas_id(nimi, katuosoite, postinro, kaupunki), osakas:osakas_id(nimi, katuosoite, postinro, kaupunki)')
      .eq('organisaatio_id', kayttaja.organisaatio_id)
      .order('erapv', { ascending: true })

    if (kirjanpitoasiakas_id) query = query.eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id)
    if (asiakas_id) query = query.eq('asiakas_id', asiakas_id)
    if (tila) query = query.eq('tila', tila)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    console.error('reskontra GET:', e)
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
    const rivit = Array.isArray(body) ? body : [body]

    // Hae tai luo loppuasiakkaat batch-tyyliin
    const nimet = [...new Set(rivit.map((r: any) => (r.asiakas || '').trim()).filter(Boolean))]
    const kirjAsId = rivit[0]?.kirjanpitoasiakas_id

    // Hae olemassaolevat
    const { data: olemassa } = await supabaseAdmin!
      .from('ppr_loppuasiakkaat')
      .select('id, nimi')
      .eq('kirjanpitoasiakas_id', kirjAsId)
      .in('nimi', nimet)

    const asiakasMap: Record<string, string> = {}
    olemassa?.forEach((a: any) => { asiakasMap[a.nimi] = a.id })

    // Luo puuttuvat kerralla
    const puuttuvat = nimet.filter(n => !asiakasMap[n])
    if (puuttuvat.length > 0) {
      const uudet = puuttuvat.map(nimi => {
        const r = rivit.find((r: any) => r.asiakas === nimi)
        return { kirjanpitoasiakas_id: kirjAsId, nimi, katuosoite: r?.osoite || null, postinro: r?.postinro || null, kaupunki: r?.kaupunki || null }
      })
      const { data: luodut } = await supabaseAdmin!
        .from('ppr_loppuasiakkaat')
        .insert(uudet)
        .select('id, nimi')
      luodut?.forEach((a: any) => { asiakasMap[a.nimi] = a.id })
    }

    // Tallenna reskontra-rivit kerralla
    const insert = rivit.map((r: any) => ({
      organisaatio_id: kayttaja.organisaatio_id,
      kirjanpitoasiakas_id: r.kirjanpitoasiakas_id || null,
      asiakas_id: asiakasMap[(r.asiakas || '').trim()] || null,
      lasku_nro: r.lasku_nro || null,
      pvm: r.pvm || null,
      erapv: r.erapv || null,
      viite: r.viite || null,
      summa: r.summa || 0,
      tila: r.tila || 'avoin',
    }))

    const { data, error } = await supabaseAdmin!
      .from('ppr_reskontra')
      .upsert(insert, { onConflict: 'viite', ignoreDuplicates: true })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, tallennettu: data?.length ?? 0 }, { status: 201 })
  } catch (e: any) {
    console.error('reskontra POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käytt��jää ei löydy' }, { status: 404 })

    const body = await request.json()
    const { id, tila, maksettu_pvm, maksettu_summa } = body
    if (!id) return NextResponse.json({ error: 'id vaaditaan' }, { status: 400 })

    const update: any = {}
    if (tila) update.tila = tila
    if (maksettu_pvm) update.maksettu_pvm = maksettu_pvm
    if (maksettu_summa !== undefined) update.maksettu_summa = maksettu_summa

    // Suodata organisaatio_id:llä — estää toisen organisaation datan muokkauksen
    const { data, error } = await supabaseAdmin!
      .from('ppr_reskontra')
      .update(update)
      .eq('id', id)
      .eq('organisaatio_id', kayttaja.organisaatio_id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('reskontra PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
