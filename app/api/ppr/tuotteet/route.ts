import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const kirjanpitoasiakas_id = searchParams.get('kirjanpitoasiakas_id')
    if (!kirjanpitoasiakas_id) return NextResponse.json({ error: 'kirjanpitoasiakas_id vaaditaan' }, { status: 400 })
    const { data, error } = await supabaseAdmin!.from('ppr_tuotteet').select('*').eq('kirjanpitoasiakas_id', kirjanpitoasiakas_id).order('tuotenro')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })
    const body = await request.json()
    console.log('Tuote POST body:', JSON.stringify(body))
    const { data, error } = await supabaseAdmin!.from('ppr_tuotteet').insert(body).select().single()
    console.log('Tuote insert error:', error)
    console.log('Tuote insert data:', data)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
