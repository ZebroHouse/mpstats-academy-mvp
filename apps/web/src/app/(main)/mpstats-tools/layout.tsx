import { redirect } from 'next/navigation';

/**
 * Env-gate for the partner-courses section. Runtime flag `PARTNER_COURSES_ENABLED`
 * (staging: true / prod: unset until launch sign-off). When off, the whole
 * /mpstats-tools section (catalog + lesson player) redirects to /learn — the nav
 * entry is hidden separately in the (main) layout via the same flag.
 */
export default function MpstatsToolsLayout({ children }: { children: React.ReactNode }) {
  if (process.env.PARTNER_COURSES_ENABLED !== 'true') {
    redirect('/learn');
  }
  return <>{children}</>;
}
