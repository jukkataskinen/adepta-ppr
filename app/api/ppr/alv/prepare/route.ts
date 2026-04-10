import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { alvTarkasteluJakso, normalizeAlvKausiKk } from '@/lib/alv-kausi'
import { laskeKirjaamattomatOstolaskutAikavalilla } from '@/lib/kuukausilukko'

const ALV_MYYNTI_ILMOITTAMATON_TILIT = ['292041', '292042', '292043', '292045', '292046', '292048']
const ALV_OSTO_ILMOITTAMATON_TILI = '292051'
const ALV_SIIRTO_TILI = '292040'

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const asiakasId = String(body?.asiakas_id || '').trim()
    /** Ankkurikuukausi (mikä tahansa kk joka kuuluu ALV-jaksoon) */
    const anchorYyyyMm = String(body?.period_yyyy_mm || '').trim()
    if (!asiakasId || !anchorYyyyMm) {
      return NextResponse.json({ error: 'asiakas_id ja period_yyyy_mm vaaditaan' }, { status: 400 })
    }

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id, rooli, sallitut_kirjanpitoasiakas_ids')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const { data: asiakas } = await supabaseAdmin!
      .from('ppr_kirjanpitoasiakkaat')
      .select('id, organisaatio_id, vastuukirjanpitaja_id, alv_kausi_kk')
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

    const kausiKk = normalizeAlvKausiKk((asiakas as { alv_kausi_kk?: unknown }).alv_kausi_kk)
    const jakso = alvTarkasteluJakso(kausiKk, anchorYyyyMm)
    if (!jakso) return NextResponse.json({ error: 'Virheellinen period_yyyy_mm' }, { status: 400 })

    const force = body?.force === true
    if (!force) {
      const pending = await laskeKirjaamattomatOstolaskutAikavalilla(
        supabaseAdmin!,
        asiakasId,
        jakso.alku,
        jakso.loppu
      )
      if (pending > 0) {
        return NextResponse.json(
          {
            error: 'ALV-jaksolla on kirjaamattomia ostolaskuja',
            pending_unposted_invoices: pending,
            period_start: jakso.alku,
            period_end: jakso.loppu,
            period_months: jakso.kuukaudet,
            period_yyyy_mm: jakso.period_yyyy_mm,
          },
          { status: 409 }
        )
      }
    }

    const { data: paivakirjaRows, error: rowsErr } = await supabaseAdmin!
      .from('ppr_paivakirja')
      .select('tili, saldo, paivamaara')
      .eq('asiakas_id', asiakasId)
      .gte('paivamaara', jakso.alku)
      .lte('paivamaara', jakso.loppu)
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })

    const saldot: Record<string, number> = {}
    ;[...ALV_MYYNTI_ILMOITTAMATON_TILIT, ALV_OSTO_ILMOITTAMATON_TILI].forEach((tili: string) => { saldot[tili] = 0 })
    ;(paivakirjaRows || []).forEach((r: { tili: string; saldo: number }) => {
      const tili = String(r?.tili || '').trim()
      if (!(tili in saldot)) return
      saldot[tili] += Number(r?.saldo || 0)
    })

    const myynti = ALV_MYYNTI_ILMOITTAMATON_TILIT.map((tili: string) => ({
      tili,
      saldo: Number((saldot[tili] || 0).toFixed(2)),
    }))
    const osto = Number((saldot[ALV_OSTO_ILMOITTAMATON_TILI] || 0).toFixed(2))
    const netTransfer = Number(([...myynti.map((x: { saldo: number }) => x.saldo), osto].reduce((s, v) => s + v, 0)).toFixed(2))

    const payload = {
      anchor_yyyy_mm: anchorYyyyMm,
      period_yyyy_mm: jakso.period_yyyy_mm,
      period_start: jakso.alku,
      period_end: jakso.loppu,
      alv_kausi_kk: kausiKk,
      period_months: jakso.kuukaudet,
      alv_siirto_tili: ALV_SIIRTO_TILI,
      myynti_tilit: myynti,
      osto_tili: { tili: ALV_OSTO_ILMOITTAMATON_TILI, saldo: osto },
      netto_siirto_292040: netTransfer,
    }

    const { data: submission, error: subErr } = await supabaseAdmin!
      .from('ppr_alv_submissions')
      .insert({
        organisaatio_id: kayttaja.organisaatio_id,
        asiakas_id: asiakasId,
        period_yyyy_mm: jakso.period_yyyy_mm,
        period_start: jakso.alku,
        period_end: jakso.loppu,
        kausi_tyyppi: jakso.kausi_tyyppi,
        status: 'prepared',
        totals: { net_transfer_292040: netTransfer },
        payload_json: payload,
        created_by_kayttaja_id: kayttaja.id,
      })
      .select('id, status, period_yyyy_mm, period_start, period_end, totals, payload_json, created_at')
      .single()
    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    await supabaseAdmin!.from('ppr_alv_submission_events').insert({
      submission_id: submission.id,
      event_type: 'prepared',
      message: 'ALV-ilmoitus valmisteltu',
      payload_json: payload,
      created_by_kayttaja_id: kayttaja.id,
    })

    return NextResponse.json({ ok: true, submission })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

