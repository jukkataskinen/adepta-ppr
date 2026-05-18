import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { laskeSeuraavat } from '@/lib/next-occurrence'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { id } = await ctx.params
    const { data: toistuvuus, error } = await supabaseAdmin!
      .from('ppr_toistuvuudet')
      .select(`
        frekvenssi, intervalli, viikonpaivat, kuukauden_paiva, kuukaudet,
        rrule_lauseke, alkupvm, loppupvm
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const paivamaarat = laskeSeuraavat(toistuvuus, 10, now)
    return NextResponse.json({
      paivamaarat: paivamaarat.map(d => d.toISOString().slice(0, 10))
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
