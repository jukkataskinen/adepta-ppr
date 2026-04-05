import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ytunnus = request.nextUrl.searchParams.get('ytunnus')
  if (!ytunnus) return NextResponse.json({ error: 'ytunnus puuttuu' }, { status: 400 })

  const puhdas = ytunnus.replace('-', '').replace(/\s/g, '')

  try {
    const res = await fetch(
      `https://avoindata.prh.fi/bis/v1/${puhdas}`,
      { headers: { 'Accept': 'application/json' } }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Haku epäonnistui' }, { status: 500 })
  }
}
