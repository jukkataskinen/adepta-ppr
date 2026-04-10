import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.redirect(new URL('/auth/login', request.url))

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('rooli')
    .eq('auth_sub', session.user.sub)
    .single()

  if (kayttaja?.rooli !== 'paakayttaja') {
    return new NextResponse('Vain pääkäyttäjällä on oikeus tarkastella tapahtumalokia.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const htmlPath = path.join(process.cwd(), 'app', 'hallinta', 'tapahtumaloki', 'tapahtumaloki.html')
  const html = fs.readFileSync(htmlPath, 'utf-8')
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
