/**
 * Kausi-string-laskenta toistuvien töiden generointia varten.
 *
 * Palauttaa:
 *  - kausi:       "2026-01", "2026-Q1", "2026", "2026-W03", "2026-01-15"
 *  - kausi_nimi:  "Tammikuu 2026", "Q1/2026", "2026", "Viikko 3 / 2026", "15.1.2026"
 *  - kausi_loppu: Date — kauden viimeinen päivä (deadlinen laskentaa varten)
 */

const KK_NIMET = [
  'Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
  'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'
]

export interface KausiTulos {
  kausi: string
  kausi_nimi: string
  kausi_loppu: Date
}

export function formatoiKausi(date: Date, frekvenssi: string): KausiTulos {
  const y = date.getFullYear()
  const m = date.getMonth()     // 0-pohjainen
  const d = date.getDate()

  switch (frekvenssi) {
    case 'kuukausittain': {
      const kk = String(m + 1).padStart(2, '0')
      const viimPv = new Date(y, m + 1, 0) // kuukauden viimeinen päivä
      return {
        kausi: `${y}-${kk}`,
        kausi_nimi: `${KK_NIMET[m]} ${y}`,
        kausi_loppu: viimPv,
      }
    }

    case 'neljannesvuosittain': {
      const q = Math.floor(m / 3) + 1
      const qLoppuKk = q * 3 // 3, 6, 9, 12
      const viimPv = new Date(y, qLoppuKk, 0)
      return {
        kausi: `${y}-Q${q}`,
        kausi_nimi: `Q${q}/${y}`,
        kausi_loppu: viimPv,
      }
    }

    case 'puolivuosittain': {
      const h = m < 6 ? 1 : 2
      const hLoppuKk = h * 6 // 6 tai 12
      const viimPv = new Date(y, hLoppuKk, 0)
      return {
        kausi: `${y}-H${h}`,
        kausi_nimi: `H${h}/${y}`,
        kausi_loppu: viimPv,
      }
    }

    case 'vuosittain': {
      const viimPv = new Date(y, 11, 31)
      return {
        kausi: `${y}`,
        kausi_nimi: `${y}`,
        kausi_loppu: viimPv,
      }
    }

    case 'viikoittain': {
      const vko = isoViikko(date)
      const viimPv = new Date(date)
      // viikon sunnuntai
      viimPv.setDate(viimPv.getDate() + (7 - viimPv.getDay()) % 7)
      return {
        kausi: `${y}-W${String(vko).padStart(2, '0')}`,
        kausi_nimi: `Viikko ${vko} / ${y}`,
        kausi_loppu: viimPv,
      }
    }

    // paivittain, mukautettu
    default: {
      const kk = String(m + 1).padStart(2, '0')
      const pp = String(d).padStart(2, '0')
      return {
        kausi: `${y}-${kk}-${pp}`,
        kausi_nimi: `${d}.${m + 1}.${y}`,
        kausi_loppu: date,
      }
    }
  }
}

/** ISO 8601 -viikkonumero */
function isoViikko(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const vuodenAlku = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - vuodenAlku.getTime()) / 86400000 + 1) / 7)
}
