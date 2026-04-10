import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { laskeKirjaamattomatOstolaskutKuukaudella } from '@/lib/kuukausilukko'

const ALV_MYYNTI_ILMOITTAMATON_TILIT = ['292041', '292042', '292043', '292045', '292046', '292048']
const ALV_OSTO_ILMOITTAMATON_TILI = '292051'
const ALV_SIIRTO_TILI = '292040'

function monthRange(yyyyMm: string): { alku: string; loppu: string } | null {
  const y = Number(String(yyyyMm || '').slice(0, 4))
  const m = Number(String(yyyyMm || '').slice(5, 7))
  if (!y || !m) return null
  const alku = `${y}-${String(m).padStart(2, '0')}-01`
  const loppuDate = new Date(y, m, 0)
  const loppu = `${y}-${String(m).padStart(2, '0')}-${String(loppuDate.getDate()).padStart(2, '0')}`
  return { alku, loppu }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const asiakasId = String(body?.asiakas_id || '').trim()
    const periodYyyyMm = String(body?.period_yyyy_mm || '').trim()
    if (!asiakasId || !periodYyyyMm) {
      return NextResponse.json({ error: 'asiakas_id ja period_yyyy_mm vaaditaan' }, { status: 400 })
    }
    const range = monthRange(periodYyyyMm)
    if (!range) return NextResponse.json({ error: 'Virheellinen period_yyyy_mm' }, { status: 400 })

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

    const force = body?.force === true
    if (!force) {
      const pending = await laskeKirjaamattomatOstolaskutKuukaudella(supabaseAdmin!, asiakasId, periodYyyyMm)
      if (pending > 0) {
        return NextResponse.json(
          {
            error: 'Kuukaudella on kirjaamattomia ostolaskuja',
            pending_unposted_invoices: pending,
          },
          { status: 409 }
        )
      }
    }

    const { data: paivakirjaRows, error: rowsErr } = await supabaseAdmin!
      .from('ppr_paivakirja')
      .select('tili, saldo, paivamaara')
      .eq('asiakas_id', asiakasId)
      .gte('paivamaara', range.alku)
      .lte('paivamaara', range.loppu)
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
      period_yyyy_mm: periodYyyyMm,
      period_start: range.alku,
      period_end: range.loppu,
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
        period_yyyy_mm: periodYyyyMm,
        period_start: range.alku,
        period_end: range.loppu,
        kausi_tyyppi: '1kk',
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

