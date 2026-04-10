import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  // Vain pääkäyttäjä voi muokata oman organisaationsa käyttäjiä
  const { data: tekija } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, rooli, organisaatio_id')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!tekija || tekija.rooli !== 'paakayttaja') {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })
  }

  // Kohdekäyttäjän pitää kuulua samaan organisaatioon
  const { data: kohde, error: kohdeErr } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id')
    .eq('id', params.id)
    .single()

  if (kohdeErr || !kohde) {
    return NextResponse.json({ error: 'Käyttäjää ei löytynyt' }, { status: 404 })
  }

  if (kohde.organisaatio_id !== tekija.organisaatio_id) {
    return NextResponse.json({ error: 'Ei oikeuksia tämän organisaation ulkopuolelle' }, { status: 403 })
  }

  const body = await request.json()
  const update: Record<string, unknown> = {}
  if (body.rooli !== undefined) update.rooli = body.rooli
  if (body.aktiivinen !== undefined) update.aktiivinen = body.aktiivinen
  if (body.sallitut_kirjanpitoasiakas_ids !== undefined) {
    const idsRaw = Array.isArray(body.sallitut_kirjanpitoasiakas_ids)
      ? body.sallitut_kirjanpitoasiakas_ids
      : []
    const ids = idsRaw.map((x: unknown) => String(x || '').trim()).filter(Boolean)

    if (ids.length > 0) {
      const { data: allowedRows, error: allowedErr } = await supabaseAdmin!
        .from('ppr_kirjanpitoasiakkaat')
        .select('id')
        .eq('organisaatio_id', tekija.organisaatio_id)
        .in('id', ids)

      if (allowedErr) return NextResponse.json({ error: allowedErr.message }, { status: 500 })
      const allowed = (allowedRows || []).map((r: any) => String(r.id))
      update.sallitut_kirjanpitoasiakas_ids = ids.filter((id: string) => allowed.includes(id))
    } else {
      update.sallitut_kirjanpitoasiakas_ids = []
    }
  }

  const { data, error } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
