import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.redirect(new URL('/auth/login', request.url))

  const { data: kayttaja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('id, organisaatio_id, rooli')
    .eq('auth_sub', session.user.sub)
    .single()

  const orgId = kayttaja?.organisaatio_id ?? ''
  const kayttajaId = kayttaja?.id ?? ''
  const rooli = kayttaja?.rooli ?? 'kirjanpitaja'

  const htmlPath = path.join(process.cwd(), 'app', 'reskontra', 'reskontra.html')
  let html = fs.readFileSync(htmlPath, 'utf-8')

  const config = `<script>
window._PPR = ${JSON.stringify({
    orgId,
    kayttajaId,
    rooli,
    email: session.user.email,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  })};
</script>`

  html = html.replace('</head>', config + '</head>')
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
