import { auth0 } from '@/lib/auth0'
import { supabaseAdmin } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login')

  const user = session.user

  if (user && supabaseAdmin) {
    // Tarkista onko käyttäjä jo olemassa
    const { data: olemassa } = await supabaseAdmin
      .from('ppr_kayttajat')
      .select('organisaatio_id')
      .eq('auth_sub', user.sub)
      .single()

    if (!olemassa) {
      // Luo organisaatio
      const { data: org } = await supabaseAdmin
        .from('ppr_organisaatiot')
        .insert({ nimi: user.email })
        .select('id')
        .single()

      if (org) {
        await supabaseAdmin.from('ppr_kayttajat').insert({
          auth_sub: user.sub,
          sahkoposti: user.email,
          rooli: 'paakayttaja',
          organisaatio_id: org.id,
          aktiivinen: true,
        })
      }
    }
  }

  redirect('/kirjanpito')
}
