// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth/supabase'
import { syncUser } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabase()

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('Error exchanging code for session:', error)
        return NextResponse.redirect(
          new URL('/sign-in?error=auth-callback-error', request.url)
        )
      }

      if (data.user) {
        // ✅ Sync user into local DB
        await syncUser(data.user)
      }

      return NextResponse.redirect(new URL(next, request.url))
    } catch (error) {
      console.error('Unexpected error during auth callback:', error)
      return NextResponse.redirect(
        new URL('/sign-in?error=callback-error', request.url)
      )
    }
  }

  // No code provided → redirect to sign in
  return NextResponse.redirect(new URL('/sign-in', request.url))
}
