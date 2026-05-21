import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_COOKIE_TTL_SECONDS,
  parseRefCodeFromUrl,
} from '@/lib/referral/attribution';

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/diagnostic', '/learn', '/profile', '/admin', '/complete-profile', '/welcome'];

function decorateWithReferral(response: NextResponse, refCode: string | null): NextResponse {
  if (refCode) {
    response.cookies.set({
      name: REFERRAL_COOKIE_NAME,
      value: refCode,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: REFERRAL_COOKIE_TTL_SECONDS,
      path: '/',
    });
  }
  return response;
}

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  const refCode = parseRefCodeFromUrl(request.nextUrl);

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Check if trying to access protected route without auth
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return decorateWithReferral(NextResponse.redirect(url), refCode);
  }

  // Check if authenticated user trying to access auth routes
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return decorateWithReferral(NextResponse.redirect(url), refCode);
  }

  return decorateWithReferral(supabaseResponse, refCode);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
