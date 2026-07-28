'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AssistantConversation } from '@/components/assistant/AssistantConversation';
import { trpc } from '@/lib/trpc/client';

export function AssistantLauncher({
  enabled,
  userName,
  assistantSeen,
}: {
  enabled: boolean;
  userName: string | null;
  assistantSeen: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Optimistic per-user badge: hide as soon as they open it, persist best-effort.
  const [seen, setSeen] = useState(assistantSeen);
  const markSeen = trpc.profile.markTourCompleted.useMutation();

  if (!enabled) return null;

  function handleToggle() {
    setOpen((v) => {
      const next = !v;
      if (next && !seen) {
        setSeen(true);
        markSeen.mutate({ page: 'assistant' }); // best-effort; badge already hidden locally
      }
      return next;
    });
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={handleToggle}
          aria-label="AI-ассистент"
          className={`assistant-glow flex h-10 items-center gap-1.5 px-4 text-sm font-semibold transition-colors ${
            open ? 'text-mp-blue-700' : 'text-mp-gray-900 hover:text-mp-blue-700'
          }`}
        >
          <Sparkles className="h-4 w-4 text-mp-blue-600" />
          <span className="hidden sm:inline">AI-ассистент</span>
        </button>
        {!seen && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-mp-pink-500 text-[11px] font-bold text-white shadow-sm"
          >
            1
          </span>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <AssistantConversation userName={userName} />
        </SheetContent>
      </Sheet>
    </>
  );
}
