import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tarkistaPaivamaaratEivatOleLukittuja, validoiLukitusJarjestys } from './kuukausilukko'

/** Supabase-ketjun pääte awaitilla (select → eq → … → maybeSingle / ketjun loppu). */
function queryBuilder<T>(final: { data: T; error: null }) {
  const self: Record<string, unknown> = {}
  const chain = () => self
  self.select = chain
  self.eq = chain
  self.order = chain
  self.limit = chain
  self.maybeSingle = () => Promise.resolve(final)
  self.then = (onFulfilled: (v: typeof final) => unknown) => Promise.resolve(final).then(onFulfilled)
  return self
}

describe('tarkistaPaivamaaratEivatOleLukittuja', () => {
  it('palauttaa 423-tyyppisen eston lukitulta kuukaudelta', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'ppr_kirjanpito_kuukausilukot') {
          return queryBuilder<{ yyyy_mm: string }[]>({ data: [{ yyyy_mm: '2025-01' }], error: null })
        }
        throw new Error('unexpected table ' + table)
      },
    } as unknown as SupabaseClient

    const r = await tarkistaPaivamaaratEivatOleLukittuja(supabase, 'asiakas-1', ['2025-01-15'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.yyyy_mm).toBe('2025-01')
      expect(r.viesti).toContain('lukittu')
    }
  })

  it('sallii kun kuukausi ei lukittu', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'ppr_kirjanpito_kuukausilukot') {
          return queryBuilder<{ yyyy_mm: string }[]>({ data: [], error: null })
        }
        throw new Error('unexpected table ' + table)
      },
    } as unknown as SupabaseClient

    const r = await tarkistaPaivamaaratEivatOleLukittuja(supabase, 'asiakas-1', ['2025-06-01'])
    expect(r.ok).toBe(true)
  })
})

describe('validoiLukitusJarjestys', () => {
  it('vaatii edeltävät kuukaudet lukituiksi', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'ppr_paivakirja') {
          return queryBuilder<{ paivamaara: string } | null>({ data: { paivamaara: '2025-01-10' }, error: null })
        }
        if (table === 'ppr_ostolaskut') {
          return queryBuilder<{ pvm: string } | null>({ data: null, error: null })
        }
        throw new Error('unexpected table ' + table)
      },
    } as unknown as SupabaseClient

    const v = await validoiLukitusJarjestys(supabase, 'a1', '2025-02', [])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.syy).toContain('2025-01')
  })

  it('hyväksyy kun välissä olevat kuukaudet lukittu', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'ppr_paivakirja') {
          return queryBuilder<{ paivamaara: string } | null>({ data: { paivamaara: '2025-01-05' }, error: null })
        }
        if (table === 'ppr_ostolaskut') {
          return queryBuilder<{ pvm: string } | null>({ data: null, error: null })
        }
        throw new Error('unexpected table ' + table)
      },
    } as unknown as SupabaseClient

    const v = await validoiLukitusJarjestys(supabase, 'a1', '2025-02', ['2025-01'])
    expect(v.ok).toBe(true)
  })
})
