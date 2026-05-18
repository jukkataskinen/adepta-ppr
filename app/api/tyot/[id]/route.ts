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
      .from('ppr_tyot')
      .select(`
        id, asiakas_id, toistuvuus_id, pohja_id,
        tyyppi, otsikko, kuvaus, status, prioriteetti,
        vastuuhenkilo_email, deadline, kausi, arvio_h, toteutunut_h,
        jarjestys, luotu, paivitetty, luoja_email,
        ppr_tyo_tehtavat ( id, otsikko, valmis, vastuuhenkilo_email, deadline, jarjestys ),
        ppr_tyo_kommentit ( id, kayttaja_email, kommentti, luotu ),
        ppr_kirjanpitoasiakkaat ( id, nimi ),
        ppr_toistuvuudet ( id, frekvenssi )
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
      'otsikko', 'kuvaus', 'status', 'prioriteetti',
      'vastuuhenkilo_email', 'deadline', 'arvio_h', 'toteutunut_h', 'jarjestys'
    ]
    const update: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Ei päivitettäviä kenttiä' }, { status: 400 })
    }

    const { error } = await supabaseAdmin!
      .from('ppr_tyot')
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
      .from('ppr_tyot')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
