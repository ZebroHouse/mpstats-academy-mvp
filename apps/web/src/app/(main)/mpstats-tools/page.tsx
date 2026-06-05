'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ToolsCatalog } from '@/components/mpstats-tools/ToolsCatalog';
import { trpc } from '@/lib/trpc/client';

export default function MpstatsToolsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка...</div>}>
      <MpstatsToolsPageInner />
    </Suspense>
  );
}

function MpstatsToolsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleKey = searchParams.get('module');

  // «Урок не найден» notice — set when a ?module= deep-link resolves to nothing.
  const [notFound, setNotFound] = useState(false);

  // Only fire the resolver when a module key is present in the URL.
  const { data: resolved, isFetched } = trpc.partner.resolveModule.useQuery(
    { moduleKey: moduleKey ?? '' },
    { enabled: Boolean(moduleKey) },
  );

  useEffect(() => {
    if (!moduleKey || !isFetched) return;

    if (resolved?.lessonId) {
      // Hit → go straight to the lesson player.
      router.replace(`/mpstats-tools/${resolved.lessonId}`);
    } else {
      // Miss → strip the param (so a refresh doesn't re-trigger) and show notice.
      setNotFound(true);
      router.replace('/mpstats-tools');
    }
  }, [moduleKey, isFetched, resolved, router]);

  // While a valid deep-link is resolving, avoid flashing the full catalog.
  if (moduleKey && (!isFetched || resolved?.lessonId)) {
    return <div className="p-8 text-center text-muted-foreground">Открываем урок...</div>;
  }

  return <ToolsCatalog notFound={notFound} />;
}
