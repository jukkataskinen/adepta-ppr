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
      .from('ppr_tyo_pohjat')
      .select(`
        id, nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h,
        deadline_offset_paivat, aktiivinen, luotu,
        ppr_tyo_pohja_tehtavat ( id, otsikko, jarjestys )
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
    const { nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat, aktiivinen, tehtavat } = body

    const update: Record<string, any> = {}
    if (nimi !== undefined) update.nimi = nimi
    if (tyyppi !== undefined) update.tyyppi = tyyppi
    if (otsikko_malli !== undefined) update.otsikko_malli = otsikko_malli
    if (kuvaus !== undefined) update.kuvaus = kuvaus
    if (prioriteetti !== undefined) update.prioriteetti = prioriteetti
    if (arvio_h !== undefined) update.arvio_h = arvio_h
    if (deadline_offset_paivat !== undefined) update.deadline_offset_paivat = deadline_offset_paivat
    if (aktiivinen !== undefined) update.aktiivinen = aktiivinen

    if (Object.keys(update).length > 0) {
      const { error } = await supabaseAdmin!
        .from('ppr_tyo_pohjat')
        .update(update)
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Päivitä tehtävät: poista vanhat ja lisää uudet
    if (tehtavat !== undefined) {
      await supabaseAdmin!
        .from('ppr_tyo_pohja_tehtavat')
        .delete()
        .eq('pohja_id', id)

      if (tehtavat.length > 0) {
        await supabaseAdmin!
          .from('ppr_tyo_pohja_tehtavat')
          .insert(tehtavat.map((t: { otsikko: string }, i: number) => ({
            pohja_id: id,
            otsikko: t.otsikko,
            jarjestys: i,
          })))
      }
    }

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
      .from('ppr_tyo_pohjat')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
