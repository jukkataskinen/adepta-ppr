import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asiakas_id = searchParams.get('asiakas_id')

  if (!asiakas_id) return NextResponse.json({ error: 'asiakas_id puuttuu' }, { status: 400 })

  const { data } = await supabaseAdmin!
    .from('ppr_paivakirja')
    .select('tosite_nro')
    .eq('asiakas_id', asiakas_id)
    .order('tosite_nro', { ascending: false })
    .limit(1)
    .single()

  const seuraava = data ? data.tosite_nro + 1 : 1
  return NextResponse.json({ seuraava })
}
