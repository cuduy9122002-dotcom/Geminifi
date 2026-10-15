import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verifies the JWT and refreshes it when close to expiry.
  // Do NOT use getSession() here: it trusts the cookie without verification.
  const { data } = await supabase.auth.getClaims()
  const isAuthed = !!data?.claims

  const { pathname } = request.nextUrl
  // Cron endpoints authenticate with CRON_SECRET inside the route handler (Step 6).
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/cron')

  if (!isAuthed && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Must return the response that setAll last built, or refreshed cookies are lost.
  return supabaseResponse
}