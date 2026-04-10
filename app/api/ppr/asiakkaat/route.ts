import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeAlvKausiKk } from '@/lib/alv-kausi'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id, rooli, sallitut_kirjanpitoasiakas_ids')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

  let query = supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .select(
      'id, nimi, y_tunnus, ytunnus, yhtiomuoto, sahkoposti, puhelin, osoite, katuosoite, postinro, kaupunki, ovt_tunnus, iban, bic, alv_velvollinen, aktiivinen, tilikausi_alkaa, tilikausi_loppuu, alv_kausi_kk'
    )
    .eq('organisaatio_id', kayttaja.organisaatio_id)
    .is('poistettu_at', null)
    .order('nimi')

  if (kayttaja.rooli === 'kirjanpitaja') {
    const allowedIds = Array.isArray(kayttaja.sallitut_kirjanpitoasiakas_ids)
      ? kayttaja.sallitut_kirjanpitoasiakas_ids.map((x: unknown) => String(x || '')).filter(Boolean)
      : []
    if (allowedIds.length > 0) {
      query = query.in('id', allowedIds)
    } else {
      // Backward compatible fallback if explicit environment rights are not yet set
      query = query.eq('vastuukirjanpitaja_id', kayttaja.id)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('organisaatio_id')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

  const body = await request.json()

  const { data, error } = await supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .insert({
      organisaatio_id: kayttaja.organisaatio_id,
      nimi: body.nimi,
      y_tunnus: body.y_tunnus ?? null,
      yhtiomuoto: body.yhtiomuoto ?? null,
      sahkoposti: body.sahkoposti ?? null,
      puhelin: body.puhelin ?? null,
      alv_velvollinen: body.alv_velvollinen ?? true,
      alv_kausi_kk: normalizeAlvKausiKk(body.alv_kausi_kk),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
