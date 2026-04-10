import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

/** Tapahtumaloki: vain pääkäyttäjä, oma organisaatio. */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja, error: kErr } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id, rooli')
      .eq('auth_sub', session.user.sub)
      .single()
    if (kErr || !kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })
    if (kayttaja.rooli !== 'paakayttaja') {
      return NextResponse.json({ error: 'Vain pääkäyttäjä' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 80)))
    const tyyppi = String(searchParams.get('tyyppi') || '').trim()

    let q = supabaseAdmin!
      .from('ppr_tapahtumaloki')
      .select('id, asiakas_id, kayttaja_id, tyyppi, viesti, payload, created_at')
      .eq('organisaatio_id', kayttaja.organisaatio_id)
    if (tyyppi) q = q.eq('tyyppi', tyyppi)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ error: 'Tapahtumaloki-taulu puuttuu — aja migraatio 20260410_2200' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rivit: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
