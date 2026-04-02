import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const body = await request.json()

  const { data, error } = await supabaseAdmin!
    .from('ppr_asiakkaat')
    .update({
      nimi: body.nimi,
      y_tunnus: body.y_tunnus ?? null,
      yhtiomuoto: body.yhtiomuoto ?? null,
      sahkoposti: body.sahkoposti ?? null,
      puhelin: body.puhelin ?? null,
      alv_velvollinen: body.alv_velvollinen ?? true,
      vastuukirjanpitaja_id: body.vastuukirjanpitaja_id ?? null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  const { error } = await supabaseAdmin!
    .from('ppr_asiakkaat')
    .update({ poistettu_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
