import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ytunnus = request.nextUrl.searchParams.get('ytunnus') || ''
  if (!ytunnus) return NextResponse.json({ error: 'ytunnus puuttuu' }, { status: 400 })

  const url = `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${ytunnus}`
  console.log('PRH haku URL:', url)

  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    console.log('PRH status:', res.status)
    const teksti = await res.text()
    console.log('PRH vastaus:', teksti.substring(0, 1000))

    let data: any = {}
    try { data = JSON.parse(teksti) } catch(e) { return NextResponse.json({ error: 'Ei JSON-vastausta', debug: teksti.substring(0, 500) }, { status: 502 }) }

    const yritys = data.companies?.[0] || data.results?.[0] || data
    console.log('Yritys keys:', JSON.stringify(Object.keys(yritys || {})))
    console.log('Yritys data:', JSON.stringify(yritys).substring(0, 2000))

    return NextResponse.json({
      yritys_keys: Object.keys(yritys || {}),
      yritys_data: yritys
    })
  } catch (e: any) {
    console.error('PRH virhe:', e)
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
