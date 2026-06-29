import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_COOKIE_TTL_SECONDS,
  parseRefCodeFromUrl,
} from '@/lib/referral/attribution';

/**
 * Record a unique-visit click for an ambassador share link. First-touch only:
 * fires when there is no ref cookie yet, or the visitor arrived via a different
 * code — so refreshes / repeat visits with the same code don't inflate the count.
 * Fire-and-forget via event.waitUntil (middleware runs on the edge → no Prisma;
 * the /api/internal/ref-click node route does the DB write). Never blocks nav.
 */
function recordReferralClick(
  request: NextRequest,
  event: NextFetchEvent,
  refCode: string | null,
): void {
  if (!refCode) return;
  const existing = request.cookies.get(REFERRAL_COOKIE_NAME)?.value;
  if (existing === refCode) return;

  const secret = process.env.REF_CLICK_SECRET;
  event.waitUntil(
    fetch(`${request.nextUrl.origin}/api/internal/ref-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-ref-click-secret': secret } : {}),
      },
      body: JSON.stringify({ code: refCode }),
    }).catch(() => {}),
  );
}

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

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const refCode = parseRefCodeFromUrl(request.nextUrl);
  recordReferralClick(request, event, refCode);

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
