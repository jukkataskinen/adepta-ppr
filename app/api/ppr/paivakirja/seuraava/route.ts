import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')
    const laji = searchParams.get('laji') || 'MU'

    if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })

    const { data, error } = await supabaseAdmin!
      .rpc('seuraava_tosite_nro', { p_asiakas_id: asiakas_id, p_laji: laji })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ tosite_nro: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
