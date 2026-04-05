import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')
    const kausi = searchParams.get('kausi')
    if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })

    let query = supabaseAdmin!
      .from('ppr_palkat')
      .select('*, ppr_henkilot(etunimi, sukunimi)')
      .eq('asiakas_id', asiakas_id)
      .order('palkkapaiva', { ascending: false })
    if (kausi) query = query.eq('kausi', kausi)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const rivit = Array.isArray(body) ? body : [body]

    const { data, error } = await supabaseAdmin!
      .from('ppr_palkat')
      .insert(rivit)
      .select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
