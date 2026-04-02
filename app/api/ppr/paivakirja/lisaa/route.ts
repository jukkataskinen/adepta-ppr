import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id')
    .eq('auth_sub', session.user.sub)
    .single()

  const body = await request.json()
  const { asiakas_id, rivit } = body

  if (!asiakas_id || !rivit?.length) {
    return NextResponse.json({ error: 'asiakas_id ja rivit vaaditaan' }, { status: 400 })
  }

  const insert = rivit.map((r: {
    paivamaara: string; tositenro?: string; selite: string;
    debet_tili: string; kredit_tili: string; netto: number; alv_prosentti: number
  }) => ({
    asiakas_id,
    paivamaara: r.paivamaara,
    tositenro: r.tositenro ?? null,
    selite: r.selite,
    debet_tili: r.debet_tili,
    kredit_tili: r.kredit_tili,
    netto: r.netto,
    alv_prosentti: r.alv_prosentti ?? 0,
    luonut_kayttaja_id: kayttaja?.id ?? null,
  }))

  const { error } = await supabaseAdmin!.from('ppr_paivakirja').insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tallennettu: insert.length })
}
