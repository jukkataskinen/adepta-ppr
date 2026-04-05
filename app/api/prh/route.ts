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

    // Yritä parsata JSON
    let data: any = {}
    try { data = JSON.parse(teksti) } catch(e) { return NextResponse.json({ error: 'Ei JSON-vastausta', debug: teksti.substring(0, 500), status: res.status }, { status: 502 }) }

    const yritys = data.companies?.[0] || data.results?.[0] || data
    return NextResponse.json({
      nimi: yritys?.name || yritys?.nimi || null,
      katuosoite: yritys?.addresses?.[0]?.street || null,
      postinro: yritys?.addresses?.[0]?.postCode || null,
      kaupunki: yritys?.addresses?.[0]?.city || null,
      yritysmuoto: yritys?.companyForm || null,
      debug_keys: Object.keys(data),
      debug_status: res.status,
    })
  } catch (e: any) {
    console.error('PRH virhe:', e)
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
