import { describe, expect, it } from 'vitest'
import { monthsRangeExclusive, paivamaaraToYyyyMm, yyyyMmCompare } from './kuukausilukko'

describe('paivamaaraToYyyyMm', () => {
  it('parsii ISO-päivän', () => {
    expect(paivamaaraToYyyyMm('2025-03-15')).toBe('2025-03')
    expect(paivamaaraToYyyyMm('2025-03-15T12:00:00Z')).toBe('2025-03')
  })
  it('palauttaa null lyhyelle merkkijonolle', () => {
    expect(paivamaaraToYyyyMm('2025-3')).toBeNull()
    expect(paivamaaraToYyyyMm('')).toBeNull()
  })
})

describe('yyyyMmCompare', () => {
  it('järjestää merkkijonot', () => {
    expect(yyyyMmCompare('2024-12', '2025-01')).toBeLessThan(0)
    expect(yyyyMmCompare('2025-01', '2025-01')).toBe(0)
    expect(yyyyMmCompare('2025-02', '2025-01')).toBeGreaterThan(0)
  })
})

describe('monthsRangeExclusive', () => {
  it('palauttaa kuukaudet [alku, loppu)', () => {
    expect(monthsRangeExclusive('2025-01', '2025-04')).toEqual(['2025-01', '2025-02', '2025-03'])
  })
  it('tyhjä jos alku >= loppu', () => {
    expect(monthsRangeExclusive('2025-03', '2025-03')).toEqual([])
    expect(monthsRangeExclusive('2025-04', '2025-01')).toEqual([])
  })
})
