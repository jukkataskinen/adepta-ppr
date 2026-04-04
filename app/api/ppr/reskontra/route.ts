import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const asiakas_id = searchParams.get('asiakas_id')
    const tila = searchParams.get('tila')

    let query = supabaseAdmin!
      .from('ppr_reskontra')
      .select('*, ppr_asiakkaat(nimi)')
      .eq('organisaatio_id', kayttaja.organisaatio_id)
      .order('erapv', { ascending: true })

    if (asiakas_id) query = query.eq('asiakas_id', asiakas_id)
    if (tila) query = query.eq('tila', tila)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    console.error('reskontra GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data: kayttaja } = await supabaseAdmin!
      .from('ppr_kayttajat')
      .select('id, organisaatio_id')
      .eq('auth_sub', session.user.sub)
      .single()
    if (!kayttaja) return NextResponse.json({ error: 'Käyttäjää ei löydy' }, { status: 404 })

    const body = await request.json()
    const rivit = Array.isArray(body) ? body : [body]
    console.log('reskontra POST:', rivit.length, 'riviä, org:', kayttaja.organisaatio_id)
    if (rivit.length > 0) console.log('reskontra POST esimerkki:', JSON.stringify(rivit[0]))

    const orgId = kayttaja.organisaatio_id
    const tulokset = []
    let virheet = 0
    const asiakasCache: Record<string, string> = {} // nimi → id

    for (const r of rivit) {
      try {
        // 1. Luo/päivitä asiakas ja hae id
        let asiakas_id = r.asiakas_id || null
        const nimi = (r.asiakas || '').trim()
        if (nimi && !asiakas_id) {
          // Tarkista cache
          if (asiakasCache[nimi]) {
            asiakas_id = asiakasCache[nimi]
          } else {
            // Etsi ensin olemassaoleva
            const { data: existing } = await supabaseAdmin!
              .from('ppr_asiakkaat')
              .select('id')
              .eq('organisaatio_id', orgId)
              .eq('nimi', nimi)
              .is('poistettu_at', null)
              .maybeSingle()

            if (existing) {
              asiakas_id = existing.id
              // Päivitä osoitetiedot
              await supabaseAdmin!
                .from('ppr_asiakkaat')
                .update({
                  katuosoite: r.osoite || null,
                  postinro: r.postinro || null,
                  kaupunki: r.kaupunki || null,
                })
                .eq('id', existing.id)
            } else {
              // Luo uusi
              const { data: uusi, error: asiakasErr } = await supabaseAdmin!
                .from('ppr_asiakkaat')
                .insert({
                  organisaatio_id: orgId,
                  nimi,
                  katuosoite: r.osoite || null,
                  postinro: r.postinro || null,
                  kaupunki: r.kaupunki || null,
                })
                .select('id')
                .single()
              if (asiakasErr) {
                console.warn('asiakas insert:', asiakasErr.code, asiakasErr.message, nimi)
              } else {
                asiakas_id = uusi.id
              }
            }
            if (asiakas_id) asiakasCache[nimi] = asiakas_id
          }
        }

        // 2. Tallenna reskontra-rivi
        const rivi = {
          organisaatio_id: orgId,
          asiakas_id,
          lasku_nro: r.lasku_nro || null,
          pvm: r.pvm || null,
          erapv: r.erapv || null,
          viite: r.viite || null,
          summa: r.summa || 0,
          tila: r.tila || 'avoin',
        }
        const { data, error } = await supabaseAdmin!
          .from('ppr_reskontra')
          .insert(rivi)
          .select()
          .single()
        if (error) {
          // Duplikaattiviite → ohita hiljaa
          if (error.code === '23505') {
            console.log('reskontra duplikaatti:', r.lasku_nro, r.viite)
          } else {
            console.error('reskontra insert:', error.code, error.message, 'lasku:', r.lasku_nro)
          }
          virheet++
        } else {
          tulokset.push(data)
        }
      } catch(e: any) {
        console.error('reskontra rivi catch:', e.message, 'lasku:', r.lasku_nro)
        virheet++
      }
    }
    console.log('reskontra POST:', tulokset.length, 'ok,', virheet, 'virheitä,', Object.keys(asiakasCache).length, 'asiakasta')
    return NextResponse.json({ ok: true, tallennettu: tulokset.length, virheet, asiakkaita: Object.keys(asiakasCache).length }, { status: 201 })
  } catch (e: any) {
    console.error('reskontra POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { id, tila, maksettu_pvm, maksettu_summa } = body
    if (!id) return NextResponse.json({ error: 'id vaaditaan' }, { status: 400 })

    const update: any = {}
    if (tila) update.tila = tila
    if (maksettu_pvm) update.maksettu_pvm = maksettu_pvm
    if (maksettu_summa !== undefined) update.maksettu_summa = maksettu_summa

    const { data, error } = await supabaseAdmin!
      .from('ppr_reskontra')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('reskontra PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
