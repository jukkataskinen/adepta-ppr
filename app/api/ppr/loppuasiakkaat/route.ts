import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const kirjanpitoasiakasId = request.nextUrl.searchParams
    .get('kirjanpitoasiakas_id')

  const { data, error } = await supabaseAdmin!
    .from('ppr_loppuasiakkaat')
    .select('*')
    .eq('kirjanpitoasiakas_id', kirjanpitoasiakasId)
    .order('nimi')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { data, error } = await supabaseAdmin!
    .from('ppr_loppuasiakkaat')
    .insert(body)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
