import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { alvTarkasteluJakso, normalizeAlvKausiKk } from '@/lib/alv-kausi'
import {
  haeLukitutKuukaudet,
  laskeKirjaamattomatOstolaskutAikavalilla,
  validoiLukitusJarjestys,
} from '@/lib/kuukausilukko'

async function assertAsiakasAccess(asiakasId: string, authSub: string) {
  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id, rooli, sallitut_kirjanpitoasiakas_ids')
    .eq('auth_sub', authSub)
    .single()
  if (!kayttaja) return { error: NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 }) }

  const { data: asiakas } = await supabaseAdmin!
    .from('ppr_kirjanpitoasiakkaat')
    .select('id, organisaatio_id, vastuukirjanpitaja_id, alv_kausi_kk')
    .eq('id', asiakasId)
    .single()
  if (!asiakas || asiakas.organisaatio_id !== kayttaja.organisaatio_id) {
    return { error: NextResponse.json({ error: 'Ei oikeutta ympäristöön' }, { status: 403 }) }
  }

  if (kayttaja.rooli === 'kirjanpitaja') {
    const allowedIds = Array.isArray(kayttaja.sallitut_kirjanpitoasiakas_ids)
      ? kayttaja.sallitut_kirjanpitoasiakas_ids.map((x: unknown) => String(x || '')).filter(Boolean)
      : []
    const canAccess = allowedIds.length > 0
      ? allowedIds.includes(asiakasId)
      : String(asiakas.vastuukirjanpitaja_id || '') === String(kayttaja.id)
    if (!canAccess) return { error: NextResponse.json({ error: 'Ei oikeutta ympäristöön' }, { status: 403 }) }
  }

  return { kayttaja, asiakas }
}

/** GET: lukitut kuukaudet tai preflight (kirjaamattomat ostolaskut). */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakasId = String(searchParams.get('asiakas_id') || '').trim()
    const yyyyMm = String(searchParams.get('yyyy_mm') || '').trim()
    const mode = String(searchParams.get('mode') || '').trim()

    if (!asiakasId) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })

    const gate = await assertAsiakasAccess(asiakasId, session.user.sub)
    if ('error' in gate && gate.error) return gate.error
    const { asiakas } = gate as { asiakas: { alv_kausi_kk?: unknown } }

    const lukitut = await haeLukitutKuukaudet(supabaseAdmin!, asiakasId)

    if (mode === 'preflight') {
      if (!/^\d{4}-\d{2}$/.test(yyyyMm)) {
        return NextResponse.json({ error: 'yyyy_mm vaaditaan (YYYY-MM)' }, { status: 400 })
      }
      const kausiKk = normalizeAlvKausiKk(asiakas?.alv_kausi_kk)
      const jakso = alvTarkasteluJakso(kausiKk, yyyyMm)
      if (!jakso) {
        return NextResponse.json({ error: 'Virheellinen yyyy_mm' }, { status: 400 })
      }
      const pending = await laskeKirjaamattomatOstolaskutAikavalilla(
        supabaseAdmin!,
        asiakasId,
        jakso.alku,
        jakso.loppu
      )
      const jarjestys = await validoiLukitusJarjestys(
        supabaseAdmin!,
        asiakasId,
        jakso.period_yyyy_mm,
        lukitut
      )
      return NextResponse.json({
        locked_months: lukitut,
        yyyy_mm: yyyyMm,
        alv_kausi_kk: kausiKk,
        period_yyyy_mm: jakso.period_yyyy_mm,
        period_start: jakso.alku,
        period_end: jakso.loppu,
        period_months: jakso.kuukaudet,
        kausi_tyyppi: jakso.kausi_tyyppi,
        pending_unposted_invoices: pending,
        can_lock_sequentially: jarjestys.ok,
        lock_order_message: jarjestys.ok ? null : jarjestys.syy,
      })
    }

    return NextResponse.json({ locked_months: lukitut })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** POST: lukitse kuukausi (vain pääkäyttäjä). */
export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const asiakasId = String(body?.asiakas_id || '').trim()
    const yyyyMm = String(body?.yyyy_mm || '').trim()

    if (!asiakasId || !/^\d{4}-\d{2}$/.test(yyyyMm)) {
      return NextResponse.json({ error: 'asiakas_id ja yyyy_mm (YYYY-MM) vaaditaan' }, { status: 400 })
    }

    const gate = await assertAsiakasAccess(asiakasId, session.user.sub)
    if ('error' in gate && gate.error) return gate.error
    const { kayttaja } = gate as { kayttaja: { id: string; rooli: string } }

    if (kayttaja.rooli !== 'paakayttaja') {
      return NextResponse.json({ error: 'Vain pääkäyttäjä voi lukita kuukauden' }, { status: 403 })
    }

    const lukitut = await haeLukitutKuukaudet(supabaseAdmin!, asiakasId)
    const v = await validoiLukitusJarjestys(supabaseAdmin!, asiakasId, yyyyMm, lukitut)
    if (!v.ok) return NextResponse.json({ error: v.syy }, { status: 409 })

    const { error } = await supabaseAdmin!.from('ppr_kirjanpito_kuukausilukot').insert({
      asiakas_id: asiakasId,
      yyyy_mm: yyyyMm,
      lukitsija_kayttaja_id: kayttaja.id,
    })
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Kuukausi on jo lukittu' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, yyyy_mm: yyyyMm })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE: avaa viimeisin lukitus (vain pääkäyttäjä). */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const asiakasId = String(searchParams.get('asiakas_id') || '').trim()

    if (!asiakasId) return NextResponse.json({ error: 'asiakas_id vaaditaan' }, { status: 400 })

    const gate = await assertAsiakasAccess(asiakasId, session.user.sub)
    if ('error' in gate && gate.error) return gate.error
    const { kayttaja } = gate as { kayttaja: { rooli: string } }

    if (kayttaja.rooli !== 'paakayttaja') {
      return NextResponse.json({ error: 'Vain pääkäyttäjä voi avata lukituksen' }, { status: 403 })
    }

    const lukitut = await haeLukitutKuukaudet(supabaseAdmin!, asiakasId)
    if (!lukitut.length) {
      return NextResponse.json({ error: 'Ei lukittuja kuukausia' }, { status: 404 })
    }

    const viimeisin = lukitut[lukitut.length - 1]

    const { error } = await supabaseAdmin!
      .from('ppr_kirjanpito_kuukausilukot')
      .delete()
      .eq('asiakas_id', asiakasId)
      .eq('yyyy_mm', viimeisin)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, unlocked_yyyy_mm: viimeisin })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
