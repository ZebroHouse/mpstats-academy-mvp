import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isStyleguideEnabled } from '../gate';
import { StyleguideV2Client } from './styleguide-v2-client';

// Internal-only, same runtime gate as /styleguide (see ../gate.ts).
export const metadata: Metadata = {
  title: 'Styleguide v2 (proposed)',
  robots: { index: false, follow: false },
};

// Runtime env gate must be evaluated per request, not baked at build time.
export const dynamic = 'force-dynamic';

export default function StyleguideV2Page() {
  if (!isStyleguideEnabled()) {
    notFound();
  }
  return <StyleguideV2Client />;
}
