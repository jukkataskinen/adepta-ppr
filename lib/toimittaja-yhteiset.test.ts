import { describe, expect, it } from 'vitest'
import { dominanttiOstolaskuRivi, normalisoiOvt, normalisoiYtunnus, parasYhteinenBumpAvain } from './toimittaja-yhteiset'

describe('normalisoiYtunnus', () => {
  it('hyväksyy 7+1 ja 8 numeroa', () => {
    expect(normalisoiYtunnus(' 1234567-8 ')).toBe('1234567-8')
    expect(normalisoiYtunnus('12345678')).toBe('1234567-8')
    expect(normalisoiYtunnus('FI12345678')).toBe('1234567-8')
  })
  it('palauttaa null huonolle', () => {
    expect(normalisoiYtunnus('')).toBeNull()
    expect(normalisoiYtunnus('abc')).toBeNull()
  })
})

describe('normalisoiOvt', () => {
  it('poistaa ei-numerot', () => {
    expect(normalisoiOvt('0037 1234567')).toBe('00371234567')
  })
  it('lyhyt hylätään', () => {
    expect(normalisoiOvt('1234567')).toBeNull()
  })
})

describe('parasYhteinenBumpAvain', () => {
  it('Y-tunnus ennen OVT', () => {
    expect(parasYhteinenBumpAvain('1234567-8', '003712345678')).toEqual({
      laji: 'ytunnus',
      avain: '1234567-8',
    })
  })
  it('vain OVT', () => {
    expect(parasYhteinenBumpAvain(null, '003712345678')).toEqual({ laji: 'ovt', avain: '003712345678' })
  })
})

describe('dominanttiOstolaskuRivi', () => {
  it('valitsee suurimman bruton', () => {
    expect(
      dominanttiOstolaskuRivi([
        { brutto: 10, tili: '4000', alv_prosentti: 25.5 },
        { brutto: 100, tili: '6500', alv_prosentti: 25.5 },
      ])
    ).toEqual({ tili: '6500', alv_prosentti: 25.5 })
  })
})
