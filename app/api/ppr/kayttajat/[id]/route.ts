import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  // Vain pääkäyttäjä voi muokata
  const { data: tekija } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('rooli')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!tekija || tekija.rooli !== 'paakayttaja') {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })
  }

  const body = await request.json()
  const update: Record<string, unknown> = {}
  if (body.rooli !== undefined) update.rooli = body.rooli
  if (body.aktiivinen !== undefined) update.aktiivinen = body.aktiivinen

  const { data, error } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
