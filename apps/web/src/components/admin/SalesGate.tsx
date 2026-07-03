'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SALES_HOME = '/admin/analytics/clients';

/**
 * Client-side guard that pins a SALES user to the client-registry page.
 * Reactive on usePathname, so it also catches client-side navigations within
 * the persistent (admin) layout (a server layout would not re-run on those).
 *
 * This is UX only — the real access boundary is the tRPC data layer, where every
 * admin procedure except getClientRegistry rejects SALES.
 */
export function SalesGate({ role }: { role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (role === 'SALES' && !pathname.startsWith(SALES_HOME)) {
      router.replace(SALES_HOME);
    }
  }, [role, pathname, router]);

  return null;
}
