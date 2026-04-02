import { auth0 } from '@/lib/auth0'
import { redirect } from 'next/navigation'
export default async function Home() {
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login')
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Adepta PPR</h1>
      <p>Tervetuloa, {session.user.email}</p>
      <a href="/auth/logout">Kirjaudu ulos</a>
    </main>
  )
}
