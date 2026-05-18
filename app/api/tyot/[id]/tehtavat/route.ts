import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { id: tyo_id } = await ctx.params
    const body = await request.json()
    const { otsikko, vastuuhenkilo_email, deadline, jarjestys } = body

    if (!otsikko) return NextResponse.json({ error: 'otsikko vaaditaan' }, { status: 400 })

    const { data, error } = await supabaseAdmin!
      .from('ppr_tyo_tehtavat')
      .insert({ tyo_id, otsikko, vastuuhenkilo_email, deadline, jarjestys: jarjestys ?? 0 })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
