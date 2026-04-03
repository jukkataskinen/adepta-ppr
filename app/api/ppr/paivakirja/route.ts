import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asiakas_id = searchParams.get('asiakas_id')

  if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id puuttuu' }, { status: 400 })

  const { data, error } = await supabaseAdmin!
    .from('ppr_paivakirja')
    .select('id, tosite_nro, paivamaara, tili, selite, saldo, alv_prosentti')
    .eq('asiakas_id', asiakas_id)
    .order('paivamaara')
    .order('tosite_nro')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id')
    .eq('auth_sub', session.user.sub)
    .single()

  const body = await request.json()
  const { asiakas_id, tosite_nro, paivamaara, rivit } = body

  if (!asiakas_id || !tosite_nro || !paivamaara || !rivit?.length) {
    return NextResponse.json({ error: 'asiakas_id, tosite_nro, paivamaara ja rivit vaaditaan' }, { status: 400 })
  }

  // Tarkista tasapaino: summa debet + kredit = 0
  const summa = rivit.reduce((s: number, r: { saldo: number }) => s + Number(r.saldo), 0)
  if (Math.abs(summa) > 0.01) {
    return NextResponse.json({ error: `Tosite ei täsmää: erotus ${summa.toFixed(2)}` }, { status: 400 })
  }

  // Poista aiempi saman tositteen data jos olemassa
  await supabaseAdmin!
    .from('ppr_paivakirja')
    .delete()
    .eq('asiakas_id', asiakas_id)
    .eq('tosite_nro', tosite_nro)

  const insert = rivit.map((r: { tili: string; selite?: string; saldo: number; alv_prosentti?: number }) => ({
    asiakas_id,
    tosite_nro,
    paivamaara,
    tili:     r.tili,
    selite:   r.selite ?? null,
    saldo:    r.saldo,
    alv_prosentti: r.alv_prosentti ?? null,
    luonut_kayttaja_id: kayttaja?.id ?? null,
  }))

  const { error } = await supabaseAdmin!.from('ppr_paivakirja').insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, tallennettu: insert.length })
}
