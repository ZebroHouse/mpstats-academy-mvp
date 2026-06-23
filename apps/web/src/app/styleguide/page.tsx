import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isStyleguideEnabled } from './gate';
import { StyleguideClient } from './styleguide-client';

// Internal-only: never indexed. Visibility is controlled at runtime by the
// STYLEGUIDE_ENABLED env flag (see ./gate.ts).
export const metadata: Metadata = {
  title: 'Styleguide (internal)',
  robots: { index: false, follow: false },
};

// Force per-request evaluation: the env gate is a RUNTIME flag. Without this the
// page is statically prerendered at build time (where STYLEGUIDE_ENABLED is
// unset) and the resulting 404 gets baked in, ignoring the runtime env.
export const dynamic = 'force-dynamic';

export default function StyleguidePage() {
  if (!isStyleguideEnabled()) {
    notFound();
  }
  return <StyleguideClient />;
}
