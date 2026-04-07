import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const kirjanpitoasiakas_id = searchParams.get('kirjanpitoasiakas_id')
    const haku = searchParams.get('haku')

    // Hae toimittajat + asiakaskohtaiset oletukset
    let query = supabaseAdmin!
      .from('ppr_toimittajat')
      .select('*, oletukset:ppr_toimittaja_oletukset(tili, alv_prosentti, selite_malli, kayttokerrat)')
      .order('nimi')

    if (haku) query = query.ilike('nimi', '%' + haku + '%')

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Jos kirjanpitoasiakas_id annettu, suodata oletukset tälle asiakkaalle
    if (kirjanpitoasiakas_id && data) {
      data.forEach((t: any) => {
        t.oletus = t.oletukset?.find((o: any) => o.kirjanpitoasiakas_id === kirjanpitoasiakas_id) || null
        // Jos ei asiakaskohtaista → hae globaali tilasto
        if (!t.oletus) {
          t.oletus_globaali = true
        }
        delete t.oletukset
      })
    }

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
    const { kirjanpitoasiakas_id, tili, alv_prosentti, selite_malli, ...toimittaja } = body

    // Etsi tai luo toimittaja ytunnuksen/nimen perusteella
    let toimittajaId: string | null = null

    if (toimittaja.ytunnus) {
      const { data: existing } = await supabaseAdmin!
        .from('ppr_toimittajat')
        .select('id')
        .eq('ytunnus', toimittaja.ytunnus)
        .maybeSingle()
      if (existing) toimittajaId = existing.id
    }

    if (!toimittajaId) {
      const { data: uusi, error } = await supabaseAdmin!
        .from('ppr_toimittajat')
        .insert(toimittaja)
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      toimittajaId = uusi.id
    }

    // Tallenna tai päivitä asiakaskohtainen oletus
    if (kirjanpitoasiakas_id && tili) {
      await supabaseAdmin!
        .from('ppr_toimittaja_oletukset')
        .upsert({
          kirjanpitoasiakas_id,
          toimittaja_id: toimittajaId,
          tili,
          alv_prosentti: alv_prosentti ?? 25.5,
          selite_malli: selite_malli ?? null,
          kayttokerrat: 1,
        }, { onConflict: 'kirjanpitoasiakas_id,toimittaja_id' })

      // Päivitä globaalit tilastot
      await supabaseAdmin!
        .from('ppr_toimittaja_tilastot')
        .upsert({
          toimittaja_id: toimittajaId,
          tili,
          alv_prosentti: alv_prosentti ?? 25.5,
          kayttokerrat: 1,
        }, { onConflict: 'toimittaja_id,tili' })
    }

    return NextResponse.json({ ok: true, toimittaja_id: toimittajaId }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
