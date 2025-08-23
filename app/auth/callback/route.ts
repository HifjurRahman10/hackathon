// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth/supabase'
import { syncUser } from '@/lib/auth/session'
import { cookies } from 'next/headers'
import { getBaseUrl } from '@/lib/utils'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const type = url.searchParams.get('type') // e.g. 'signup', 'magiclink', 'recovery'
  const supabase = createServerSupabase()

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session || !data.user) {
      return NextResponse.redirect(`${getBaseUrl()}/sign-in?error=auth`)
    }

    // Sync local user
    await syncUser(data.user)

    // Set our lightweight session cookie
    cookies().set(
      'session',
      JSON.stringify({
        user: { id: data.user.id },
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 7
      }
    )

    // Decide redirect target
    const dest = type === 'recovery' ? '/reset-password' : '/dashboard'

    return NextResponse.redirect(`${getBaseUrl()}${dest}`)
  }

  return NextResponse.redirect(`${getBaseUrl()}/sign-in?error=missing_code`)
}
