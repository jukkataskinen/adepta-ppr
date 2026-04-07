import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { data, error } = await supabaseAdmin!
      .from('ppr_myyntilaskut')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Jos PDF tallennettiin ja lasku on sisäinen → kopioi PDF ostolaskun liitteeksi
    if (body.tosite_pdf_path && data.asiakas_ovt_tunnus) {
      const { data: vastaanottaja } = await supabaseAdmin!
        .from('ppr_kirjanpitoasiakkaat')
        .select('id')
        .eq('ovt_tunnus', data.asiakas_ovt_tunnus)
        .maybeSingle()

      if (vastaanottaja) {
        const olNro = 'OL' + data.lasku_nro
        const olPolku = vastaanottaja.id + '/tositteet/' + olNro + '/lasku.pdf'
        const { data: fileData } = await supabaseAdmin!.storage.from('tositteet').download(body.tosite_pdf_path)
        if (fileData) {
          await supabaseAdmin!.storage.from('tositteet').upload(olPolku, fileData, { contentType: 'application/pdf', upsert: true })
          await supabaseAdmin!.from('ppr_tosite_liitteet').insert({
            asiakas_id: vastaanottaja.id,
            tosite_nro: olNro,
            tiedostonimi: olNro + '.pdf',
            storage_path: olPolku,
            koko_bytes: 0,
          })
        }
      }
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
