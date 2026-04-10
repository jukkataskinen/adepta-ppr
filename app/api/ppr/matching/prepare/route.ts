import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { prepareMatching } from '@/lib/matching'

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const tapahtumat = Array.isArray(body?.tapahtumat) ? body.tapahtumat : []
    const laskut = Array.isArray(body?.laskut) ? body.laskut : []
    const topK = Number(body?.settings?.topK || 5)
    if (!tapahtumat.length) {
      return NextResponse.json({ error: 'tapahtumat vaaditaan' }, { status: 400 })
    }

    const { queue, stats } = prepareMatching(tapahtumat, laskut, Math.max(1, Math.min(10, topK)))
    return NextResponse.json({ queue, stats })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 })
  }
}
