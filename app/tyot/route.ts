import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session) return NextResponse.redirect(new URL('/auth/login', request.url))

  const htmlPath = path.join(process.cwd(), 'app', 'tyot', 'tyot.html')
  const html = fs.readFileSync(htmlPath, 'utf-8')
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
