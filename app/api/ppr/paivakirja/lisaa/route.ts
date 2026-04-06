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
  const { rivit } = body

  if (!rivit?.length) {
    return NextResponse.json({ error: 'rivit vaaditaan' }, { status: 400 })
  }

  const insert = rivit.map((r: any) => ({
    asiakas_id: r.asiakas_id,
    tosite_nro: r.tosite_nro ?? null,
    paivamaara: r.paivamaara,
    tili: r.tili,
    selite: r.selite,
    saldo: r.saldo,
    alv_prosentti: r.alv_prosentti ?? null,
    luonut_kayttaja_id: kayttaja?.id ?? null,
  }))

  const { error } = await supabaseAdmin!.from('ppr_paivakirja').insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tallennettu: insert.length })
}
