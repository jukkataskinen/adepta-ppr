/**
 * Laskee toistuvuuden seuraavan esiintymispäivän rrule-kirjastolla.
 */
import { RRule, Weekday } from 'rrule'

/** Viikonpäivänumerot PPR:ssä: 1=ma .. 7=su → rrule Weekday */
const VKP_MAP: Record<number, Weekday> = {
  1: RRule.MO,
  2: RRule.TU,
  3: RRule.WE,
  4: RRule.TH,
  5: RRule.FR,
  6: RRule.SA,
  7: RRule.SU,
}

export interface Toistuvuus {
  frekvenssi: string
  intervalli: number
  viikonpaivat: number[] | null
  kuukauden_paiva: number | null
  kuukaudet: number[] | null
  rrule_lauseke: string | null
  alkupvm: string        // "YYYY-MM-DD"
  loppupvm: string | null
}

/**
 * Palauttaa seuraavan esiintymispäivän annetun päivämäärän jälkeen,
 * tai null jos toistuvuus on päättynyt.
 */
export function laskeSeuraavaEsiintyma(
  toistuvuus: Toistuvuus,
  afterDate: Date
): Date | null {
  const rule = rakennaRRule(toistuvuus)
  const next = rule.after(afterDate, false)

  if (!next) return null

  // Tarkista loppupvm
  if (toistuvuus.loppupvm) {
    const loppu = new Date(toistuvuus.loppupvm + 'T23:59:59')
    if (next > loppu) return null
  }

  return next
}

/**
 * Palauttaa seuraavat N esiintymää esikatselua varten.
 */
export function laskeSeuraavat(
  toistuvuus: Toistuvuus,
  count: number,
  afterDate: Date
): Date[] {
  const rule = rakennaRRule(toistuvuus)
  const loppu = toistuvuus.loppupvm
    ? new Date(toistuvuus.loppupvm + 'T23:59:59')
    : null

  // Hae riittävästi ja rajaa
  const maxHaku = new Date(afterDate)
  maxHaku.setFullYear(maxHaku.getFullYear() + 5)
  const end = loppu && loppu < maxHaku ? loppu : maxHaku

  const tulokset = rule.between(afterDate, end, false)
  return tulokset.slice(0, count)
}

function rakennaRRule(t: Toistuvuus): RRule {
  const dtstart = new Date(t.alkupvm + 'T00:00:00')

  // Mukautettu RRULE-lauseke
  if (t.frekvenssi === 'mukautettu' && t.rrule_lauseke) {
    const rule = RRule.fromString(t.rrule_lauseke)
    // Aseta dtstart erikseen
    return new RRule({ ...rule.origOptions, dtstart })
  }

  // Rakenna enum-arvoista
  const options: Partial<InstanceType<typeof RRule>['origOptions']> = {
    dtstart,
    interval: t.intervalli || 1,
  }

  switch (t.frekvenssi) {
    case 'paivittain':
      options.freq = RRule.DAILY
      break

    case 'viikoittain':
      options.freq = RRule.WEEKLY
      if (t.viikonpaivat?.length) {
        options.byweekday = t.viikonpaivat.map(v => VKP_MAP[v]).filter(Boolean)
      }
      break

    case 'kuukausittain':
      options.freq = RRule.MONTHLY
      if (t.kuukauden_paiva != null) {
        options.bymonthday = [t.kuukauden_paiva]
      }
      break

    case 'neljannesvuosittain':
      options.freq = RRule.MONTHLY
      options.interval = (t.intervalli || 1) * 3
      if (t.kuukauden_paiva != null) {
        options.bymonthday = [t.kuukauden_paiva]
      }
      if (t.kuukaudet?.length) {
        options.bymonth = t.kuukaudet
      }
      break

    case 'puolivuosittain':
      options.freq = RRule.MONTHLY
      options.interval = (t.intervalli || 1) * 6
      if (t.kuukauden_paiva != null) {
        options.bymonthday = [t.kuukauden_paiva]
      }
      if (t.kuukaudet?.length) {
        options.bymonth = t.kuukaudet
      }
      break

    case 'vuosittain':
      options.freq = RRule.YEARLY
      if (t.kuukaudet?.length) {
        options.bymonth = t.kuukaudet
      }
      if (t.kuukauden_paiva != null) {
        options.bymonthday = [t.kuukauden_paiva]
      }
      break

    default:
      options.freq = RRule.MONTHLY
  }

  return new RRule(options as any)
}
