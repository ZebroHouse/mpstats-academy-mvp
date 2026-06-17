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

export default function StyleguidePage() {
  if (!isStyleguideEnabled()) {
    notFound();
  }
  return <StyleguideClient />;
}
