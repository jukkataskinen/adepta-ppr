import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { tarkistaPaivamaaratEivatOleLukittuja } from '@/lib/kuukausilukko'

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

  // Tarkista tasapaino tositteittain
  const tositeSummat: Record<string, number> = {}
  rivit.forEach((r: any) => {
    const nro = r.tosite_nro || 'default'
    if (!tositeSummat[nro]) tositeSummat[nro] = 0
    tositeSummat[nro] += Number(r.saldo)
  })
  const epatasapainot = Object.entries(tositeSummat)
    .filter(([_, s]) => Math.abs(s) > 0.01)
    .map(([nro, s]) => `${nro}: ${s.toFixed(2)}`)
  if (epatasapainot.length > 0) {
    return NextResponse.json({
      error: 'Tositteet eivät täsmää: ' + epatasapainot.join(', ')
    }, { status: 400 })
  }

  const asiakasIds = Array.from(new Set(rivit.map((r: any) => String(r.asiakas_id || '').trim()).filter(Boolean)))
  if (asiakasIds.length !== 1) {
    return NextResponse.json({ error: 'Kaikilla riveillä sama asiakas_id vaaditaan' }, { status: 400 })
  }
  const asiakasId = String(asiakasIds[0] ?? '')
  const pvmList = rivit.map((r: any) => String(r.paivamaara || '').trim()).filter(Boolean)
  const lukko = await tarkistaPaivamaaratEivatOleLukittuja(supabaseAdmin!, asiakasId, pvmList)
  if (!lukko.ok) {
    return NextResponse.json({ error: lukko.viesti }, { status: 423 })
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
