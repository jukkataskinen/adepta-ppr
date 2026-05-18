import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { id } = await ctx.params
    const { data, error } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .select(`
        id, asiakas_id, pohja_id, vastuuhenkilo_email,
        frekvenssi, intervalli, viikonpaivat, kuukauden_paiva, kuukaudet,
        rrule_lauseke, alkupvm, loppupvm, seuraava_luonti_pvm,
        luo_paivia_etukateen, aktiivinen, luotu, paivitetty,
        ppr_tyo_pohjat ( id, nimi, tyyppi )
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { id } = await ctx.params
    const body = await request.json()

    const allowed = [
      'vastuuhenkilo_email', 'frekvenssi', 'intervalli',
      'viikonpaivat', 'kuukauden_paiva', 'kuukaudet',
      'rrule_lauseke', 'alkupvm', 'loppupvm', 'seuraava_luonti_pvm',
      'luo_paivia_etukateen', 'aktiivinen'
    ]
    const update: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Ei päivitettäviä kenttiä' }, { status: 400 })
    }

    const { error } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .update(update)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { id } = await ctx.params
    const { error } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
