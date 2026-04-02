import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('organisaatio_id')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

  const { data, error } = await supabaseAdmin!
    .from('ppr_tilikartta')
    .select('nro, lbl, grp, tyyppi, alv')
    .or(`organisaatio_id.is.null,organisaatio_id.eq.${kayttaja.organisaatio_id}`)
    .order('nro')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
