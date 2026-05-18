import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { formatoiKausi } from '@/lib/kausi'
import { laskeSeuraavaEsiintyma } from '@/lib/next-occurrence'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  // Vercel Cron -autentikointi
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    // 1. Hae aktiiviset toistuvuudet joissa seuraava_luonti_pvm on erääntyyt
    //    (seuraava_luonti_pvm <= today + luo_paivia_etukateen käsitellään alla)
    const { data: toistuvuudet, error: fetchError } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .select(`
        id, asiakas_id, pohja_id, vastuuhenkilo_email,
        frekvenssi, intervalli, viikonpaivat, kuukauden_paiva, kuukaudet,
        rrule_lauseke, alkupvm, loppupvm, seuraava_luonti_pvm, luo_paivia_etukateen
      `)
      .eq('aktiivinen', true)
      .lte('seuraava_luonti_pvm', today.toISOString().slice(0, 10))

    if (fetchError) {
      console.error('cron: toistuvuudet fetch error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!toistuvuudet?.length) {
      return NextResponse.json({ luotu_kpl: 0, virheet: [] })
    }

    // 2. Hae pohjat ja niiden tehtävät kerralla
    const pohjaIdt = Array.from(new Set(toistuvuudet.map(t => t.pohja_id)))
    const { data: pohjat } = await supabaseAdmin!
      .from('ppr_tyo_pohjat')
      .select('id, nimi, tyyppi, otsikko_malli, kuvaus, prioriteetti, arvio_h, deadline_offset_paivat')
      .in('id', pohjaIdt)

    const { data: pohjaTehtavat } = await supabaseAdmin!
      .from('ppr_tyo_pohja_tehtavat')
      .select('pohja_id, otsikko, jarjestys')
      .in('pohja_id', pohjaIdt)
      .order('jarjestys')

    const pohjaMap = new Map((pohjat ?? []).map(p => [p.id, p]))
    const tehtavaMap = new Map<string, typeof pohjaTehtavat>()
    for (const t of pohjaTehtavat ?? []) {
      const arr = tehtavaMap.get(t.pohja_id) ?? []
      arr.push(t)
      tehtavaMap.set(t.pohja_id, arr)
    }

    let luotu_kpl = 0
    const virheet: string[] = []

    // 3. Käsittele jokainen toistuvuus
    for (const toistuvuus of toistuvuudet) {
      try {
        const pohja = pohjaMap.get(toistuvuus.pohja_id)
        if (!pohja) {
          virheet.push(`Toistuvuus ${toistuvuus.id}: pohja ${toistuvuus.pohja_id} ei löydy`)
          continue
        }

        // Laske kausi ja deadline seuraava_luonti_pvm:n perusteella
        const luontiPvm = new Date(toistuvuus.seuraava_luonti_pvm + 'T00:00:00')
        const { kausi, kausi_nimi, kausi_loppu } = formatoiKausi(luontiPvm, toistuvuus.frekvenssi)

        // Deadline = kauden loppu + offset
        const deadline = new Date(kausi_loppu)
        deadline.setDate(deadline.getDate() + (pohja.deadline_offset_paivat || 0))
        const deadlineStr = deadline.toISOString().slice(0, 10)

        // Otsikko: korvaa placeholderit
        const otsikko = (pohja.otsikko_malli || pohja.nimi)
          .replace('{kausi_nimi}', kausi_nimi)
          .replace('{asiakas_nimi}', '') // täydennetään tarvittaessa
          .trim()

        // 3a. Luo työ (unique constraint estää duplikaatit)
        const { data: uusiTyo, error: insertError } = await supabaseAdmin!
          .from('ppr_tyot')
          .insert({
            asiakas_id: toistuvuus.asiakas_id,
            toistuvuus_id: toistuvuus.id,
            pohja_id: toistuvuus.pohja_id,
            tyyppi: pohja.tyyppi,
            otsikko,
            kuvaus: pohja.kuvaus,
            status: 'jonossa',
            prioriteetti: pohja.prioriteetti || 'normaali',
            vastuuhenkilo_email: toistuvuus.vastuuhenkilo_email,
            deadline: deadlineStr,
            kausi,
            arvio_h: pohja.arvio_h,
          })
          .select('id')
          .single()

        if (insertError) {
          // 23505 = unique_violation → työ on jo olemassa, ohita
          if (insertError.code === '23505') {
            console.log(`cron: työ ${kausi} asiakkaalle ${toistuvuus.asiakas_id} on jo olemassa, ohitetaan`)
          } else {
            virheet.push(`Toistuvuus ${toistuvuus.id}: ${insertError.message}`)
            continue
          }
        }

        // 3b. Kopioi oletustehtävät uudelle työlle
        if (uusiTyo) {
          const tehtavat = tehtavaMap.get(toistuvuus.pohja_id) ?? []
          if (tehtavat.length > 0) {
            await supabaseAdmin!
              .from('ppr_tyo_tehtavat')
              .insert(tehtavat.map(t => ({
                tyo_id: uusiTyo.id,
                otsikko: t.otsikko,
                jarjestys: t.jarjestys,
              })))
          }
          luotu_kpl++
        }

        // 3c. Päivitä seuraava_luonti_pvm
        const seuraava = laskeSeuraavaEsiintyma(toistuvuus, luontiPvm)
        if (seuraava) {
          await supabaseAdmin!
            .from('ppr_toistuvuudet')
            .update({ seuraava_luonti_pvm: seuraava.toISOString().slice(0, 10) })
            .eq('id', toistuvuus.id)
        } else {
          // Ei enää esiintymiä → passivoi toistuvuus
          await supabaseAdmin!
            .from('ppr_toistuvuudet')
            .update({ aktiivinen: false })
            .eq('id', toistuvuus.id)
        }
      } catch (err: any) {
        virheet.push(`Toistuvuus ${toistuvuus.id}: ${err.message}`)
      }
    }

    console.log(`cron: luo-toistuvat-tyot valmis — luotu ${luotu_kpl}, virheitä ${virheet.length}`)
    return NextResponse.json({ luotu_kpl, virheet })
  } catch (e: any) {
    console.error('cron: luo-toistuvat-tyot error:', e)
    return NextResponse.json({ error: e.message || 'Tuntematon virhe' }, { status: 500 })
  }
}
