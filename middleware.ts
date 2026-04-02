import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { auth0 } from './lib/auth0'

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request)
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith('/auth')) return authRes
  const session = await auth0.getSession(request)
  if (!session) {
    const loginUrl = new URL('/auth/login', request.nextUrl.origin)
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }
  return authRes
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
}
