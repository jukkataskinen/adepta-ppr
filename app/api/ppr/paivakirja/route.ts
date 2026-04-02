import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asiakas_id = searchParams.get('asiakas_id')
  const vuosi = searchParams.get('vuosi')

  if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id puuttuu' }, { status: 400 })

  let query = supabaseAdmin!
    .from('ppr_paivakirja')
    .select('id, paivamaara, tositenro, selite, debet_tili, kredit_tili, netto, alv_prosentti, alv_euro, brutto')
    .eq('asiakas_id', asiakas_id)
    .order('paivamaara')
    .order('luotu_at')

  if (vuosi) query = query.eq('tilikausi_vuosi', parseInt(vuosi))

  const { data, error } = await query
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
  const { asiakas_id, tilikausi_vuosi, rivit } = body

  if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id puuttuu' }, { status: 400 })

  // Poista vanhat rivit kyseiseltä tilikaudelta
  const { error: delErr } = await supabaseAdmin!
    .from('ppr_paivakirja')
    .delete()
    .eq('asiakas_id', asiakas_id)
    .eq('tilikausi_vuosi', tilikausi_vuosi)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (rivit && rivit.length > 0) {
    const insert = rivit
      .filter((r: { paivamaara: string; selite: string }) => r.paivamaara && r.selite)
      .map((r: {
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

    const { error: insErr } = await supabaseAdmin!
      .from('ppr_paivakirja')
      .insert(insert)

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tallennettu: rivit?.length ?? 0 })
}
