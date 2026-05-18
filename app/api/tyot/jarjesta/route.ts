import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Drag & drop -järjestyksen päivitys.
 * Body: { tyot: [{ id, status, jarjestys }] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

    const body = await request.json()
    const { tyot } = body

    if (!Array.isArray(tyot) || tyot.length === 0) {
      return NextResponse.json({ error: 'tyot-taulukko vaaditaan' }, { status: 400 })
    }

    // Päivitä jokainen työ erikseen (batch)
    const errors: string[] = []
    for (const t of tyot) {
      if (!t.id) continue
      const update: Record<string, any> = {}
      if (t.status !== undefined) update.status = t.status
      if (t.jarjestys !== undefined) update.jarjestys = t.jarjestys

      if (Object.keys(update).length > 0) {
        const { error } = await supabaseAdmin!
          .from('ppr_tyot')
          .update(update)
          .eq('id', t.id)
        if (error) errors.push(`${t.id}: ${error.message}`)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 500 })
    }
    return NextResponse.json({ ok: true, paivitetty: tyot.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
