import { describe, expect, it } from 'vitest'
import { prepareMatching } from './matching'

describe('prepareMatching (pankki ↔ ostolasku)', () => {
  it('nostaa viitteen täsmäyksen kärkeen', () => {
    const events = [
      {
        summa: -120.5,
        sel: 'Nordea',
        maksu: 'Oy Testi Ab',
        viite: 'RF71 1234',
        arvopv: '2025-03-10',
      },
    ]
    const invoices = [
      {
        toimittaja: 'Testi Ab',
        summa_brutto: 120.5,
        viite: 'RF711234',
        pvm: '2025-03-09',
      },
    ]
    const { queue, stats } = prepareMatching(events, invoices, 5)
    expect(stats.events).toBe(1)
    expect(stats.invoices).toBe(1)
    expect(queue[0].suggestions.length).toBeGreaterThan(0)
    const top = queue[0].suggestions[0]
    expect(top.reasons).toContain('viite')
    expect(top.confidence).toMatch(/high|medium/)
  })

  it('ohittaa tuodut ja ohitetut tapahtumat', () => {
    const events = [
      { summa: -10, tila: 'tuotu' },
      { summa: -20, tila: 'ohitettu' },
      { summa: -30 },
    ]
    const { stats } = prepareMatching(events, [{ summa_brutto: 30 }], 3)
    expect(stats.events).toBe(1)
  })

  it('ohittaa jo kohdistetut laskut (tapIdx)', () => {
    const events = [{ summa: -50, maksu: 'Acme' }]
    const invoices = [
      { summa_brutto: 50, toimittaja: 'Acme Oy', tapIdx: 0 },
      { summa_brutto: 50, toimittaja: 'Acme Oy' },
    ]
    const { queue } = prepareMatching(events, invoices, 5)
    expect(queue[0].suggestions.every((s) => s.invoiceIdx === 1)).toBe(true)
  })

  it('palauttaa tyhjän jonon ilman aktiivisia', () => {
    const { queue, stats } = prepareMatching([], [], 5)
    expect(queue).toEqual([])
    expect(stats.events).toBe(0)
  })
})
