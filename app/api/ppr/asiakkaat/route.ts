import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id, rooli')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

  let query = supabaseAdmin!
    .from('ppr_asiakkaat')
    .select('id, nimi, y_tunnus, ytunnus, katuosoite, postinro, kaupunki, ovt_tunnus, iban, bic')
    .eq('organisaatio_id', kayttaja.organisaatio_id)
    .is('poistettu_at', null)
    .order('nimi')

  // TODO: kirjanpitäjäsuodatus lisätään kun sarake on viewissä

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
    .from('ppr_asiakkaat')
    .insert({
      organisaatio_id: kayttaja.organisaatio_id,
      nimi: body.nimi,
      y_tunnus: body.y_tunnus ?? null,
      yhtiomuoto: body.yhtiomuoto ?? null,
      sahkoposti: body.sahkoposti ?? null,
      puhelin: body.puhelin ?? null,
      alv_velvollinen: body.alv_velvollinen ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
