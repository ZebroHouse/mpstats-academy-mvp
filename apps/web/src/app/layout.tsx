import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import '@/styles/globals.css';
import { TRPCProvider } from '@/lib/trpc/provider';
import { LandingThemeProvider } from '@/components/shared/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { YandexMetrika } from '@koiztech/next-yandex-metrika';
import { CookieConsent } from '@/components/shared/CookieConsent';
import { KbdOverlay } from '@/components/shared/KbdOverlay';
import { StagingBanner } from '@/components/shared/StagingBanner';

// v2 reskin: product on Onest (brand font), wired to Tailwind via --font-onest.
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-onest',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: 'MPSTATS Academy — адаптивная платформа для селлеров Wildberries и Ozon',
    template: '%s | MPSTATS Academy',
  },
  description: 'Первая адаптивная образовательная платформа для селлеров. AI-диагностика за 10 минут, программа под ваш уровень, 400+ уроков по 5 направлениям.',
  metadataBase: new URL('https://platform.mpstats.academy'),
  verification: {
    yandex: 'ca2450fe5fe87a68',
  },
  other: {
    'yandex-verification': 'e98fa8cbfa8c4e26',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'MPSTATS Academy',
    title: 'MPSTATS Academy — адаптивная платформа для селлеров Wildberries и Ozon',
    description: 'Первая адаптивная образовательная платформа для селлеров. AI-диагностика за 10 минут, программа под ваш уровень, 400+ уроков по 5 направлениям.',
    url: 'https://platform.mpstats.academy',
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'MPSTATS Academy',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-landing-theme="light" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC: apply saved landing theme before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('landing-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-landing-theme',t)}catch(e){}})()`,
          }}
        />
        {/* Carrot Quest widget */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){function t(t,e){return function(){window.carrotquestasync.push(t,arguments)}}if("undefined"==typeof carrotquest){var e=document.createElement("script");e.type="text/javascript",e.async=!0,e.src="https://cdn.carrotquest.app/api.min.js",document.getElementsByTagName("head")[0].appendChild(e),window.carrotquest={},window.carrotquestasync=[],carrotquest.settings={};for(var n=["connect","track","identify","auth","onReady","addCallback","removeCallback","trackMessageInteraction"],a=0;a<n.length;a++)carrotquest[n[a]]=t(n[a])}}(),carrotquest.connect("57576-5a5343ec7aac68d788dabb2569");`,
          }}
        />
      </head>
      <body className={`${onest.variable} font-sans`}>
        <StagingBanner />
        <LandingThemeProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </LandingThemeProvider>
        <Toaster />
        <CookieConsent />
        <KbdOverlay />
        {process.env.NODE_ENV === 'production' &&
          process.env.NEXT_PUBLIC_STAGING !== 'true' &&
          process.env.NEXT_PUBLIC_YANDEX_ID && (
          <YandexMetrika
            yid={Number(process.env.NEXT_PUBLIC_YANDEX_ID)}
            clickmap={true}
            trackLinks={true}
            accurateTrackBounce={true}
            webvisor={true}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
