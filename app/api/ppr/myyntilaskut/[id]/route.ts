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
        // Saapuva ostolasku löytyy toimittajan_lasku_nro-kentästä (ML tosite), ei lasku_nro:sta.
        const mahdollisetTositeet = Array.from(new Set([
          data.tosite_nro,
          data.lasku_nro ? `ML${data.lasku_nro}` : null,
        ].filter(Boolean)))

        let ostolasku: any = null
        for (const tosite of mahdollisetTositeet) {
          const { data: osumat, error: olHakuErr } = await supabaseAdmin!
            .from('ppr_ostolaskut')
            .select('id, lasku_nro, toimittajan_lasku_nro')
            .eq('kirjanpitoasiakas_id', vastaanottaja.id)
            .eq('toimittajan_lasku_nro', tosite)
            .limit(1)

          if (olHakuErr) {
            console.error('Ostolaskun haku epäonnistui:', olHakuErr.message)
            continue
          }
          if (osumat && osumat.length > 0) {
            ostolasku = osumat[0]
            break
          }
        }

        if (!ostolasku) {
          console.warn('Sisäisen ostolaskun linkitys epäonnistui', {
            vastaanottaja_id: vastaanottaja.id,
            myyntilasku_id: data.id,
            tosite_nro: data.tosite_nro,
            lasku_nro: data.lasku_nro,
          })
          return NextResponse.json(data)
        }

        const liiteTositeNro = ostolasku.lasku_nro || ostolasku.toimittajan_lasku_nro || `OL-${ostolasku.id}`
        const olPolku = `${vastaanottaja.id}/tositteet/ostolasku-${ostolasku.id}/lasku.pdf`
        const { data: fileData } = await supabaseAdmin!.storage.from('tositteet').download(body.tosite_pdf_path)
        if (fileData) {
          await supabaseAdmin!.storage.from('tositteet').upload(olPolku, fileData, { contentType: 'application/pdf', upsert: true })
          await supabaseAdmin!.from('ppr_tosite_liitteet').insert({
            asiakas_id: vastaanottaja.id,
            tosite_nro: liiteTositeNro,
            tiedostonimi: liiteTositeNro + '.pdf',
            storage_path: olPolku,
            koko_bytes: 0,
          })
        }
        // Päivitä myös ostolaskun PDF-polku
        if (olPolku) {
          await supabaseAdmin!
            .from('ppr_ostolaskut')
            .update({ tosite_pdf_path: olPolku })
            .eq('id', ostolasku.id)
        }
      }
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
