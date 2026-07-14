'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AssistantConversation } from '@/components/assistant/AssistantConversation';

export function AssistantLauncher({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="AI-ассистент"
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
          open ? 'border-mp-blue-600 bg-mp-blue-600 text-white' : 'border-mp-gray-200 bg-white text-mp-gray-900 hover:bg-mp-gray-50'
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">AI-ассистент</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <AssistantConversation />
        </SheetContent>
      </Sheet>
    </>
  );
}
