import { describe, expect, it } from 'vitest'
import { alvTarkasteluJakso, normalizeAlvKausiKk } from './alv-kausi'

describe('normalizeAlvKausiKk', () => {
  it('palauttaa 1, 3 tai 12', () => {
    expect(normalizeAlvKausiKk(1)).toBe(1)
    expect(normalizeAlvKausiKk(3)).toBe(3)
    expect(normalizeAlvKausiKk(12)).toBe(12)
    expect(normalizeAlvKausiKk('3')).toBe(3)
    expect(normalizeAlvKausiKk(undefined)).toBe(1)
    expect(normalizeAlvKausiKk(2)).toBe(1)
  })
})

describe('alvTarkasteluJakso', () => {
  it('1 kk: helmikuu 2025', () => {
    const j = alvTarkasteluJakso(1, '2025-02')
    expect(j).not.toBeNull()
    expect(j!.alku).toBe('2025-02-01')
    expect(j!.loppu).toBe('2025-02-28')
    expect(j!.kuukaudet).toEqual(['2025-02'])
    expect(j!.period_yyyy_mm).toBe('2025-02')
    expect(j!.kausi_tyyppi).toBe('1kk')
  })

  it('3 kk: ankkuri helmi → Q1 2025', () => {
    const j = alvTarkasteluJakso(3, '2025-02')
    expect(j).not.toBeNull()
    expect(j!.alku).toBe('2025-01-01')
    expect(j!.loppu).toBe('2025-03-31')
    expect(j!.kuukaudet).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(j!.period_yyyy_mm).toBe('2025-03')
    expect(j!.kausi_tyyppi).toBe('3kk')
  })

  it('3 kk: ankkuri elo → Q3', () => {
    const j = alvTarkasteluJakso(3, '2025-08')
    expect(j!.kuukaudet).toEqual(['2025-07', '2025-08', '2025-09'])
    expect(j!.period_yyyy_mm).toBe('2025-09')
  })

  it('12 kk: ankkuri mikä tahansa kk → koko vuosi', () => {
    const j = alvTarkasteluJakso(12, '2025-04')
    expect(j!.alku).toBe('2025-01-01')
    expect(j!.loppu).toBe('2025-12-31')
    expect(j!.kuukaudet[0]).toBe('2025-01')
    expect(j!.kuukaudet[11]).toBe('2025-12')
    expect(j!.period_yyyy_mm).toBe('2025-12')
    expect(j!.kausi_tyyppi).toBe('12kk')
  })

  it('hylkää virheellisen ankkurin', () => {
    expect(alvTarkasteluJakso(1, '')).toBeNull()
    expect(alvTarkasteluJakso(1, '2025-13')).toBeNull()
  })
})
