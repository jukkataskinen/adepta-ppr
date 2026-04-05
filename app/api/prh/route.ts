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

    const yritys = data.companies?.[0]
    if (!yritys) return NextResponse.json({ error: 'Yritystä ei löytynyt' }, { status: 404 })

    const nimiObj = yritys.names?.find((n: any) => n.type === '1' && !n.endDate)
    const osoite = yritys.addresses?.[0]
    const kaupunki = osoite?.postOffices?.find((p: any) => p.languageCode === '1')?.city
    const muoto = yritys.companyForms?.[0]?.descriptions?.find((d: any) => d.languageCode === '1')?.description

    return NextResponse.json({
      nimi: nimiObj?.name || null,
      katuosoite: osoite ? ((osoite.street || '') + ' ' + (osoite.buildingNumber || '')).trim() : null,
      postinro: osoite?.postCode || null,
      kaupunki: kaupunki || null,
      yritysmuoto: muoto || null,
      ytunnus: yritys.businessId?.value || null,
    })
  } catch (e: any) {
    console.error('PRH virhe:', e)
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
