// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareSupabase } from '@/lib/auth/supabase'

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createMiddlewareSupabase(request)

  // Refresh session if expired - required for Server Components
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/sign-in',
    '/sign-up',
    '/auth/callback',
    '/auth/auth-code-error',
    '/',
  ]

  // Define protected routes
  const protectedRoutes = [
    '/dashboard',
    '/settings',
    '/team',
    '/billing',
    '/account',
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  // If user is signed in and trying to access auth pages, redirect to dashboard
  if (session && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const redirectUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // If user is not signed in and trying to access protected routes, redirect to sign in
  if (!session && isProtectedRoute) {
    const redirectUrl = new URL('/sign-in', request.url)
    // Preserve the original URL as a redirect parameter
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Handle auth callback
  if (pathname === '/auth/callback') {
    // Let the callback handler process this
    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}