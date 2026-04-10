import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeAlvKausiKk } from '@/lib/alv-kausi'

const PATCHABLE = new Set([
  'nimi',
  'y_tunnus',
  'yhtiomuoto',
  'sahkoposti',
  'puhelin',
  'alv_velvollinen',
  'vastuukirjanpitaja_id',
  'katuosoite',
  'postinro',
  'kaupunki',
  'iban',
  'bic',
  'ovt_tunnus',
  'verkkolaskuoperaattori',
  'alv_tunnus',
  'tilikausi_alkaa',
  'tilikausi_loppuu',
  'verotiliviite',
  'kotisivu',
  'alv_kausi_kk',
])

async function assertKirjanpitoAsiakas(id: string, authSub: string) {
  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id, rooli, sallitut_kirjanpitoasiakas_ids')
    .eq('auth_sub', authSub)
    .single()
  if (!kayttaja) return { error: NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 }) }

  const { data: row } = await supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .select('id, organisaatio_id, vastuukirjanpitaja_id')
    .eq('id', id)
    .single()
  if (!row) return { error: NextResponse.json({ error: 'Asiakasta ei löydy' }, { status: 404 }) }
  if (row.organisaatio_id !== kayttaja.organisaatio_id) {
    return { error: NextResponse.json({ error: 'Ei oikeutta' }, { status: 403 }) }
  }

  if (kayttaja.rooli === 'kirjanpitaja') {
    const allowedIds = Array.isArray(kayttaja.sallitut_kirjanpitoasiakas_ids)
      ? kayttaja.sallitut_kirjanpitoasiakas_ids.map((x: unknown) => String(x || '')).filter(Boolean)
      : []
    const canAccess = allowedIds.length > 0
      ? allowedIds.includes(id)
      : String(row.vastuukirjanpitaja_id || '') === String(kayttaja.id)
    if (!canAccess) return { error: NextResponse.json({ error: 'Ei oikeutta' }, { status: 403 }) }
  }

  return { kayttaja }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const gate = await assertKirjanpitoAsiakas(params.id, session.user.sub)
  if ('error' in gate && gate.error) return gate.error

  const body = await request.json()
  const update: Record<string, unknown> = {}

  for (const key of Array.from(PATCHABLE)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      if (key === 'alv_kausi_kk') update[key] = normalizeAlvKausiKk(body[key])
      else if (key === 'alv_velvollinen') update[key] = Boolean(body[key])
      else update[key] = body[key] ?? null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Ei päivitettäviä kenttiä' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const gate = await assertKirjanpitoAsiakas(params.id, session.user.sub)
  if ('error' in gate && gate.error) return gate.error

  const { error } = await supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .update({ poistettu_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
