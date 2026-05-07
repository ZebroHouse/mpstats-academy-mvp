'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { createClient } from '@/lib/supabase/client';

const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const TEXT = '#121212';

const NAV_LINKS = [
  { label: 'Платформа', href: '/' },
  { label: 'Каталог', href: '/courses' },
  { label: 'Диагностика', href: '/skill-test' },
  { label: 'Тарифы', href: '/pricing' },
  { label: 'О нас', href: '/about' },
];

interface V8HeaderProps {
  /** Страница начинается с тёмного hero — нав/лого светлые до скролла. По умолчанию true. */
  onDarkHero?: boolean;
}

export function V8Header({ onDarkHero = true }: V8HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [userName, setUserName] = useState<string>('');
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const pickName = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (!u) return '';
      const meta = u.user_metadata || {};
      return (
        (meta.full_name as string) ||
        (meta.name as string) ||
        u.email?.split('@')[0] ||
        ''
      );
    };
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user);
      setUserName(pickName(data.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session?.user);
      setUserName(pickName(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const initials = userName
    ? userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || userName.slice(0, 2).toUpperCase()
    : '';

  const ctaHref =
    isAuthed === true
      ? '/diagnostic'
      : pathname === '/skill-test'
        ? '/register'
        : '/skill-test';

  const isLight = onDarkHero && !scrolled;
  const logoVariant = isLight ? 'white' : 'default';
  const linkColor = isLight ? 'rgba(255,255,255,0.85)' : TEXT;
  const burgerColor = isLight ? 'white' : TEXT;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? 'rgba(255,255,255,0.98)' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(18,18,18,0.06)' : '1px solid transparent',
      }}
    >
      <div className="max-w-[1160px] mx-auto flex items-center justify-between h-[64px] sm:h-[72px] px-4 sm:px-6 md:px-10 lg:px-0">
        <Logo size="sm" variant={logoVariant} href="/" />

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-5 lg:gap-7">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[14px] font-medium transition-colors hover:opacity-80"
              style={{ color: linkColor }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right: Auth + CTA */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthed ? (
            <Link
              href="/profile"
              className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <div
                className="w-8 h-8 rounded-full text-white flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                style={{ backgroundColor: BLUE }}
              >
                {initials || '··'}
              </div>
              <span
                className="text-[14px] font-medium max-w-[160px] truncate"
                style={{ color: linkColor }}
              >
                {userName || 'Кабинет'}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[14px] font-medium transition-colors hover:opacity-80"
              style={{ color: linkColor }}
            >
              Войти
            </Link>
          )}
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center rounded-full h-[44px] px-6 text-[14px] font-medium text-white transition-colors"
            style={{ backgroundColor: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
          >
            Пройти диагностику
          </Link>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden flex flex-col gap-[5px] p-2"
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label="Menu"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-5 h-[2px] rounded-full transition-all"
              style={{ backgroundColor: burgerColor }}
            />
          ))}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenu && (
        <div className="md:hidden bg-white px-4 pb-4 border-b border-[#121212]/6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block py-3 text-[15px] font-medium"
              style={{ color: TEXT }}
              onClick={() => setMobileMenu(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/roadmap"
            className="block py-3 text-[14px] font-medium border-t border-[#121212]/10 mt-2 pt-4"
            style={{ color: TEXT, opacity: 0.6 }}
            onClick={() => setMobileMenu(false)}
          >
            Roadmap
          </Link>
          {isAuthed ? (
            <Link
              href="/profile"
              className="flex items-center gap-2.5 py-3"
              style={{ color: TEXT }}
              onClick={() => setMobileMenu(false)}
            >
              <div
                className="w-8 h-8 rounded-full text-white flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                style={{ backgroundColor: BLUE }}
              >
                {initials || '··'}
              </div>
              <span className="text-[15px] font-medium truncate">
                {userName || 'Кабинет'}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="block py-3 text-[15px] font-medium"
              style={{ color: TEXT }}
              onClick={() => setMobileMenu(false)}
            >
              Войти
            </Link>
          )}
          <Link
            href={ctaHref}
            className="mt-2 inline-flex items-center justify-center rounded-full h-[48px] w-full text-[15px] font-medium text-white"
            style={{ backgroundColor: BLUE }}
            onClick={() => setMobileMenu(false)}
          >
            Пройти диагностику
          </Link>
        </div>
      )}
    </nav>
  );
}
