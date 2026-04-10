import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { submitVatReturn } from '@/lib/vero-api'

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
      return NextResponse.json({ error: 'Vain pääkäyttäjä voi lähettää ilmoituksen' }, { status: 403 })
    }

    const { data: sub, error: subErr } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .select('id, status, organisaatio_id, period_yyyy_mm, payload_json')
      .eq('id', submissionId)
      .single()
    if (subErr || !sub) return NextResponse.json({ error: 'Lähetystä ei löytynyt' }, { status: 404 })
    if (sub.organisaatio_id !== kayttaja.organisaatio_id) {
      return NextResponse.json({ error: 'Ei oikeutta lähetykseen' }, { status: 403 })
    }
    if (sub.status !== 'approved') {
      return NextResponse.json({ error: `Lähetystä ei voi lähettää tilassa ${sub.status}` }, { status: 409 })
    }

    const submitResult = await submitVatReturn({
      submissionId,
      periodYyyyMm: String(sub.period_yyyy_mm || ''),
      payload: (sub.payload_json || {}) as Record<string, unknown>,
    })

    const { data: updated, error: updErr } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        response_json: submitResult.receipt,
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select('id, status, period_yyyy_mm, totals, created_at, submitted_at, response_json')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabaseAdmin!.from('ppr_alv_submission_events').insert({
      submission_id: submissionId,
      event_type: 'submitted',
      message: `ALV-ilmoitus lähetetty (${submitResult.mode}) kaudelle ${sub.period_yyyy_mm}`,
      payload_json: submitResult.receipt,
      created_by_kayttaja_id: kayttaja.id,
    })

    return NextResponse.json({ ok: true, submission: updated, mock: submitResult.mode === 'mock' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const submissionId = String(params.id || '').trim()
    if (submissionId) {
      await supabaseAdmin!
        .from('ppr_alv_submissions')
        .update({
          status: 'failed',
          error_code: 'SUBMIT_ERROR',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId)
      await supabaseAdmin!.from('ppr_alv_submission_events').insert({
        submission_id: submissionId,
        event_type: 'submit_failed',
        message: msg,
        payload_json: { error: msg },
      })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

