import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ytunnus = request.nextUrl.searchParams.get('ytunnus')
  if (!ytunnus) return NextResponse.json({ error: 'ytunnus puuttuu' }, { status: 400 })

  const puhdas = ytunnus.replace('-', '').replace(/\s/g, '')

  try {
    const url = `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${puhdas}`
    console.log('PRH URL:', url)
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    console.log('PRH status:', res.status)
    const data = await res.json()
    console.log('PRH data:', JSON.stringify(data).substring(0, 500))
    const yritys = data.companies?.[0]
    return NextResponse.json({
      nimi: yritys?.name,
      katuosoite: yritys?.addresses?.[0]?.street,
      postinro: yritys?.addresses?.[0]?.postCode,
      kaupunki: yritys?.addresses?.[0]?.city,
      yritysmuoto: yritys?.companyForm,
      raaka: yritys
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
