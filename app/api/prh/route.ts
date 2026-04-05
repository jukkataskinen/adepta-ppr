import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ytunnus = request.nextUrl.searchParams.get('ytunnus')
  if (!ytunnus) return NextResponse.json({ error: 'ytunnus puuttuu' }, { status: 400 })

  const puhdas = ytunnus.replace('-', '').replace(/\s/g, '')

  try {
    const url = `https://avoindata.prh.fi/ytj/v3/companies/${puhdas}`
    console.log('PRH URL:', url)
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    console.log('PRH status:', res.status)
    const data = await res.json()
    console.log('PRH data:', JSON.stringify(data).substring(0, 500))
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
