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
    const asiakas_id = searchParams.get('asiakas_id')
    const tila = searchParams.get('tila')

    let query = supabaseAdmin!
      .from('ppr_reskontra')
      .select('*, ppr_asiakkaat(nimi)')
      .eq('organisaatio_id', kayttaja.organisaatio_id)
      .order('erapv', { ascending: true })

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
    console.log('reskontra POST:', rivit.length, 'riviä, org:', kayttaja.organisaatio_id)
    if (rivit.length > 0) console.log('reskontra POST esimerkki:', JSON.stringify(rivit[0]))

    const tulokset = []
    let virheet = 0
    for (const r of rivit) {
      const rivi = {
        organisaatio_id: kayttaja.organisaatio_id,
        asiakas_id: r.asiakas_id || null,
        lasku_nro: r.lasku_nro || null,
        pvm: r.pvm || null,
        erapv: r.erapv || null,
        viite: r.viite || null,
        summa: r.summa || 0,
        tila: r.tila || 'avoin',
      }
      try {
        const { data, error } = await supabaseAdmin!
          .from('ppr_reskontra')
          .insert(rivi)
          .select()
          .single()
        if (error) {
          console.error('reskontra insert error:', error.code, error.message, 'lasku:', r.lasku_nro, 'viite:', r.viite)
          virheet++
        } else {
          tulokset.push(data)
        }
      } catch(e: any) {
        console.error('reskontra insert catch:', e.message, 'lasku:', r.lasku_nro)
        virheet++
      }
    }
    console.log('reskontra POST tulos:', tulokset.length, 'ok,', virheet, 'virheitä')
    return NextResponse.json({ ok: true, tallennettu: tulokset.length, virheet }, { status: 201 })
  } catch (e: any) {
    console.error('reskontra POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { id, tila, maksettu_pvm, maksettu_summa } = body
    if (!id) return NextResponse.json({ error: 'id vaaditaan' }, { status: 400 })

    const update: any = {}
    if (tila) update.tila = tila
    if (maksettu_pvm) update.maksettu_pvm = maksettu_pvm
    if (maksettu_summa !== undefined) update.maksettu_summa = maksettu_summa

    const { data, error } = await supabaseAdmin!
      .from('ppr_reskontra')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('reskontra PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
