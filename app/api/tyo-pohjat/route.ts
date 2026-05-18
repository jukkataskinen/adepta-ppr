import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { data, error } = await supabaseAdmin!
      .from('ppr_tyo_pohjat')
      .select(`
        id, nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h,
        deadline_offset_paivat, aktiivinen, luotu,
        ppr_tyo_pohja_tehtavat ( id, otsikko, jarjestys )
      `)
      .order('nimi')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat, tehtavat } = body

    if (!nimi || !tyyppi || !otsikko_malli) {
      return NextResponse.json({ error: 'nimi, tyyppi ja otsikko_malli vaaditaan' }, { status: 400 })
    }

    const { data: pohja, error } = await supabaseAdmin!
      .from('ppr_tyo_pohjat')
      .insert({ nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Lisää oletustehtävät jos annettu
    if (tehtavat?.length && pohja) {
      await supabaseAdmin!
        .from('ppr_tyo_pohja_tehtavat')
        .insert(tehtavat.map((t: { otsikko: string }, i: number) => ({
          pohja_id: pohja.id,
          otsikko: t.otsikko,
          jarjestys: i,
        })))
    }

    return NextResponse.json({ ok: true, id: pohja.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
