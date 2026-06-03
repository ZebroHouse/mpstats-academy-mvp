import { redirect } from 'next/navigation';

/**
 * Legacy alias `/learn/track` → `/learn/plan` (D-01).
 *
 * Server Component redirect — preserves bookmarks, emails, and internal links
 * pointing at the old «Мой трек» route. Must stay server-side: a client-side
 * navigation here re-triggers the Next Router Cache loop (incident 2026-05-19,
 * CLAUDE.md gotcha).
 */
export default function TrackRedirect() {
  redirect('/learn/plan');
}
