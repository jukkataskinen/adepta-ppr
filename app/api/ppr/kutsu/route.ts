import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'

async function getManagementToken() {
  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.AUTH0_MGMT_CLIENT_ID,
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
      grant_type: 'client_credentials',
    })
  })
  const data = await res.json()
  return data.access_token
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.json({ error: 'Ei istuntoa' }, { status: 401 })

  // Vain pääkäyttäjä voi kutsua
  const { data: kutsuja } = await supabaseAdmin!
    .from('ppr_kayttajat')
    .select('organisaatio_id, rooli')
    .eq('auth_sub', session.user.sub)
    .single()

  if (!kutsuja || kutsuja.rooli !== 'paakayttaja') {
    return NextResponse.json({ error: 'Ei oikeuksia' }, { status: 403 })
  }

  const body = await request.json()
  const { email, rooli } = body
  if (!email || !rooli) return NextResponse.json({ error: 'email ja rooli vaaditaan' }, { status: 400 })

  const token = await getManagementToken()
  console.log('token saatu:', !!token, 'domain:', process.env.AUTH0_DOMAIN)

  // Luo käyttäjä Auth0:aan
  const createRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/api/v2/users`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      connection: 'Username-Password-Authentication',
      password: Math.random().toString(36).slice(-12) + 'A1!',
      email_verified: false,
    })
  })
  const auth0User = await createRes.json()
  if (!createRes.ok) return NextResponse.json({ error: auth0User.message }, { status: 400 })

  // Lähetä salasanan vaihto -sähköposti
  await fetch(`https://${process.env.AUTH0_DOMAIN}/api/v2/tickets/password-change`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: auth0User.user_id,
      result_url: process.env.APP_BASE_URL,
      ttl_sec: 604800,
    })
  })

  // Lisää käyttäjä Supabaseen
  await supabaseAdmin!.from('ppr_kayttajat').insert({
    auth_sub: auth0User.user_id,
    sahkoposti: email,
    rooli,
    organisaatio_id: kutsuja.organisaatio_id,
    aktiivinen: true,
  })

  return NextResponse.json({ ok: true, message: 'Kutsu lähetetty osoitteeseen ' + email })
}
