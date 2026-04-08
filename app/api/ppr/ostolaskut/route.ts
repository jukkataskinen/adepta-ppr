import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const kirjanpitoasiakas_id = searchParams.get('kirjanpitoasiakas_id')
    const tila = searchParams.get('tila')

    if (!kirjanpitoasiakas_id) return NextResponse.json({ error: 'kirjanpitoasiakas_id vaaditaan' }, { status: 400 })

    let query = supabaseAdmin!
      .from('ppr_ostolaskut')
      .select('*, rivit:ppr_ostolasku_rivit(*), toimittaja:ppr_toimittajat(nimi, ytunnus)')
      .eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id)
      .order('luotu_at', { ascending: false })

    if (tila) query = query.eq('tila', tila)

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
    const { rivit, ...lasku } = body

    const { data: laskuData, error: laskuErr } = await supabaseAdmin!
      .from('ppr_ostolaskut')
      .insert(lasku)
      .select()
      .single()
    if (laskuErr) return NextResponse.json({ error: laskuErr.message }, { status: 500 })

    if (rivit?.length) {
      const { error: rivitErr } = await supabaseAdmin!
        .from('ppr_ostolasku_rivit')
        .insert(rivit.map((r: any) => ({ ...r, lasku_id: laskuData.id })))
      if (rivitErr) return NextResponse.json({ error: rivitErr.message }, { status: 500 })
    }

    return NextResponse.json(laskuData, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { id, rivit, ...paivitys } = body
    if (!id) return NextResponse.json({ error: 'id vaaditaan' }, { status: 400 })

    console.log('PATCH paivitys:', JSON.stringify(paivitys))
    console.log('PATCH rivit:', JSON.stringify(rivit?.length))
    let data: any = null
    if (Object.keys(paivitys).length > 0) {
      const { data: updated, error } = await supabaseAdmin!
        .from('ppr_ostolaskut')
        .update(paivitys)
        .eq('id', id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      data = updated
    } else {
      const { data: existing, error } = await supabaseAdmin!
        .from('ppr_ostolaskut')
        .select()
        .eq('id', id)
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      data = existing
    }

    // Päivitä rivit jos annettu
    if (rivit?.length) {
      await supabaseAdmin!.from('ppr_ostolasku_rivit').delete().eq('lasku_id', id)
      await supabaseAdmin!.from('ppr_ostolasku_rivit').insert(
        rivit.map((r: any) => {
          const { id: _id, lasku_id: _lid, created_at: _ca, ...rivi } = r
          return { ...rivi, lasku_id: id }
        })
      )
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
