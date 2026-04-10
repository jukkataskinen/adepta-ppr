import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakasId = String(searchParams.get('asiakas_id') || '').trim()
    if (!asiakasId) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })

    const rawLimit = Number(searchParams.get('limit') || 20)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id, rooli, sallitut_kirjanpitoasiakas_ids')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const { data: asiakas } = await supabaseAdmin!
      .from('ppr_kirjanpitoasiakkaat')
      .select('id, organisaatio_id, vastuukirjanpitaja_id')
      .eq('id', asiakasId)
      .single()
    if (!asiakas || asiakas.organisaatio_id !== kayttaja.organisaatio_id) {
      return NextResponse.json({ error: 'Ei oikeutta ympäristöön' }, { status: 403 })
    }

    if (kayttaja.rooli === 'kirjanpitaja') {
      const allowedIds = Array.isArray(kayttaja.sallitut_kirjanpitoasiakas_ids)
        ? kayttaja.sallitut_kirjanpitoasiakas_ids.map((x: unknown) => String(x || '')).filter(Boolean)
        : []
      const canAccess = allowedIds.length > 0
        ? allowedIds.includes(asiakasId)
        : String(asiakas.vastuukirjanpitaja_id || '') === String(kayttaja.id)
      if (!canAccess) return NextResponse.json({ error: 'Ei oikeutta ympäristöön' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .select('id, status, period_yyyy_mm, period_start, period_end, totals, created_at, submitted_at, error_code, error_message')
      .eq('asiakas_id', asiakasId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

