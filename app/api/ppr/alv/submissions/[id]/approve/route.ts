import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const submissionId = String(params.id || '').trim()
    if (!submissionId) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id, rooli')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })
    if (kayttaja.rooli !== 'paakayttaja') {
      return NextResponse.json({ error: 'Vain pääkäyttäjä voi hyväksyä lähetyksen' }, { status: 403 })
    }

    const { data: sub, error: subErr } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .select('id, status, organisaatio_id, period_yyyy_mm')
      .eq('id', submissionId)
      .single()
    if (subErr || !sub) return NextResponse.json({ error: 'Lähetystä ei löytynyt' }, { status: 404 })
    if (sub.organisaatio_id !== kayttaja.organisaatio_id) {
      return NextResponse.json({ error: 'Ei oikeutta lähetykseen' }, { status: 403 })
    }
    if (sub.status !== 'prepared') {
      return NextResponse.json({ error: `Lähetystä ei voi hyväksyä tilassa ${sub.status}` }, { status: 409 })
    }

    const { data: updated, error: updErr } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .update({
        status: 'approved',
        approved_by_kayttaja_id: kayttaja.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select('id, status, period_yyyy_mm, totals, created_at, submitted_at')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabaseAdmin!.from('ppr_alv_submission_events').insert({
      submission_id: submissionId,
      event_type: 'approved',
      message: `ALV-ilmoitus hyväksytty kaudelle ${sub.period_yyyy_mm}`,
      created_by_kayttaja_id: kayttaja.id,
    })

    return NextResponse.json({ ok: true, submission: updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

