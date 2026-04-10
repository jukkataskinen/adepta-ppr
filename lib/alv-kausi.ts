/** ALV-tarkastelujakso: kalenterikuukausi, kalenterineljännes tai kalenterivuosi. */

export type AlvKausiKk = 1 | 3 | 12

export type AlvKausiTyyppi = '1kk' | '3kk' | '12kk'

export type AlvTarkasteluJakso = {
  /** Jakson ensimmäinen päivä (yyyy-mm-dd) */
  alku: string
  /** Jakson viimeinen päivä (yyyy-mm-dd) */
  loppu: string
  /** Kuukaudet järjestyksessä yyyy-mm (lukitseminen tässä järjestyksessä) */
  kuukaudet: string[]
  /** Yksiselitteinen jakson tunniste: viimeinen kuukausi yyyy-mm */
  period_yyyy_mm: string
  kausi_tyyppi: AlvKausiTyyppi
}

export function normalizeAlvKausiKk(v: unknown): AlvKausiKk {
  const n = Number(v)
  if (n === 3 || n === 12) return n
  return 1
}

/**
 * @param anchorYyyyMm Käyttäjän valitsema kuukausi (mikä tahansa kuukausi, joka kuuluu haluttuun jaksoon)
 */
export function alvTarkasteluJakso(kausiKk: AlvKausiKk, anchorYyyyMm: string): AlvTarkasteluJakso | null {
  const ym = String(anchorYyyyMm || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return null
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (!y || !m) return null

  if (kausiKk === 1) {
    const alku = `${y}-${String(m).padStart(2, '0')}-01`
    const loppuDate = new Date(y, m, 0)
    const loppu = `${y}-${String(m).padStart(2, '0')}-${String(loppuDate.getDate()).padStart(2, '0')}`
    return {
      alku,
      loppu,
      kuukaudet: [ym],
      period_yyyy_mm: ym,
      kausi_tyyppi: '1kk',
    }
  }

  if (kausiKk === 12) {
    const alku = `${y}-01-01`
    const loppu = `${y}-12-31`
    const kuukaudet: string[] = []
    for (let mm = 1; mm <= 12; mm++) {
      kuukaudet.push(`${y}-${String(mm).padStart(2, '0')}`)
    }
    return {
      alku,
      loppu,
      kuukaudet,
      period_yyyy_mm: `${y}-12`,
      kausi_tyyppi: '12kk',
    }
  }

  // 3 kk: kalenterineljännes (tammi–maalis, huhti–kesä, heinä–syys, loka–joulu)
  const q = Math.floor((m - 1) / 3)
  const mStart = q * 3 + 1
  const mEnd = mStart + 2
  const alku = `${y}-${String(mStart).padStart(2, '0')}-01`
  const loppuDate = new Date(y, mEnd, 0)
  const loppu = `${y}-${String(mEnd).padStart(2, '0')}-${String(loppuDate.getDate()).padStart(2, '0')}`
  const kuukaudet = [
    `${y}-${String(mStart).padStart(2, '0')}`,
    `${y}-${String(mStart + 1).padStart(2, '0')}`,
    `${y}-${String(mEnd).padStart(2, '0')}`,
  ]
  const period_yyyy_mm = `${y}-${String(mEnd).padStart(2, '0')}`
  return {
    alku,
    loppu,
    kuukaudet,
    period_yyyy_mm,
    kausi_tyyppi: '3kk',
  }
}
