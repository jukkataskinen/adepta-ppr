import type { SupabaseClient } from '@supabase/supabase-js'

export type TapahtumaLokiRivi = {
  organisaatio_id: string
  asiakas_id?: string | null
  kayttaja_id?: string | null
  tyyppi: string
  viesti?: string | null
  payload?: Record<string, unknown>
}

/** Kirjaa tapahtuman (ei heitä — virheet vain konsoliin, ei estä päätoimintoa). */
export async function kirjaTapahtumaloki(
  supabase: SupabaseClient,
  rivi: TapahtumaLokiRivi
): Promise<void> {
  try {
    const { error } = await supabase.from('ppr_tapahtumaloki').insert({
      organisaatio_id: rivi.organisaatio_id,
      asiakas_id: rivi.asiakas_id ?? null,
      kayttaja_id: rivi.kayttaja_id ?? null,
      tyyppi: rivi.tyyppi,
      viesti: rivi.viesti ?? null,
      payload: rivi.payload ?? {},
    })
    if (error) console.warn('[tapahtumaloki]', error.message)
  } catch (e) {
    console.warn('[tapahtumaloki]', e)
  }
}
