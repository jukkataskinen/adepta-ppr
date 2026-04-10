/** Suoritettava myynti-ALV kertymä (ilmoittamaton erittely). Synkassa kirjanpito.html ALV-rivien kanssa. */
export const ALV_MYYNTI_ILMOITTAMATON_TILIT = ['292041', '292042', '292043', '292045', '292046', '292048'] as const

/** Vähennettävä osto-ALV kertymä */
export const ALV_OSTO_ILMOITTAMATON_TILI = '292051'

/** ALV yhteistili (siirto / velka) */
export const ALV_SIIRTO_TILI = '292040'

/** Kaikki kertymätilit (ennen ALV-siirtoa 292040) — käytä etusivun "avoin kausi" -laskennassa */
export function alvKertymaTilitLista(): string[] {
  return [...ALV_MYYNTI_ILMOITTAMATON_TILIT, ALV_OSTO_ILMOITTAMATON_TILI]
}
