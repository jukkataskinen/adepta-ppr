import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

interface Ctx { params: Promise<{ id: string; t_id: string }> }

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { t_id } = await ctx.params
    const body = await request.json()

    const allowed = ['otsikko', 'valmis', 'vastuuhenkilo_email', 'deadline', 'jarjestys']
    const update: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Ei päivitettäviä kenttiä' }, { status: 400 })
    }

    const { error } = await supabaseAdmin!
      .from('ppr_tyo_tehtavat')
      .update(update)
      .eq('id', t_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const { t_id } = await ctx.params
    const { error } = await supabaseAdmin!
      .from('ppr_tyo_tehtavat')
      .delete()
      .eq('id', t_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
