'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import type { JSONContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { LessonBodyRenderer } from './LessonBodyRenderer';
import { buildRevealPlan, type InteractiveProgressState, type RevealItem } from './interactive-reveal';

const EMPTY_STATE: InteractiveProgressState = { version: 1, revealedGateIds: [], checkpointChoices: {} };

interface Handlers {
  passGate: (id: string) => void;
  chooseOption: (checkpointId: string, optionId: string) => void;
}

// After a reveal, we bring the top of the freshly revealed content just below
// this offset from the viewport top — enough to keep a sliver of prior context
// visible while starting the new text near the top of the reading area.
const REVEAL_SCROLL_OFFSET = 96;

// Each reveal item mounts exactly once (React keeps prior items by key), so this
// CSS animation plays only when a chunk is first revealed — a smooth fade + rise,
// like content "arriving" rather than popping in. Re-renders don't replay it.
// `motion-reduce:animate-none` honors the OS "reduce motion" setting (content
// just appears, no fade/slide) for motion-sensitive users.
const REVEAL_ANIM =
  'animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out fill-mode-both motion-reduce:animate-none';

/** Ordered list of every reveal item key currently shown, recursing into branches. */
function flattenKeys(items: RevealItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    out.push(item.key);
    if (item.kind === 'checkpoint') out.push(...flattenKeys(item.branch));
  }
  return out;
}

function RenderItem({
  item,
  handlers,
  registerRef,
}: {
  item: RevealItem;
  handlers: Handlers;
  registerRef: (key: string, el: HTMLElement | null) => void;
}) {
  if (item.kind === 'segment') {
    return (
      <div ref={(el) => registerRef(item.key, el)} className={REVEAL_ANIM}>
        <LessonBodyRenderer doc={{ type: 'doc', content: item.blocks }} />
      </div>
    );
  }
  if (item.kind === 'gate') {
    if (item.passed) return <hr ref={(el) => registerRef(item.key, el)} className="my-6 border-mp-gray-100" />;
    return (
      <div ref={(el) => registerRef(item.key, el)} className={`my-6 flex justify-center ${REVEAL_ANIM}`}>
        <Button size="lg" onClick={() => handlers.passGate(item.id)}>
          {item.label}
        </Button>
      </div>
    );
  }
  // checkpoint
  return (
    <div ref={(el) => registerRef(item.key, el)} className={`my-6 ${REVEAL_ANIM}`}>
      <div className="flex flex-wrap gap-2">
        {item.options.map((o) => (
          <Button
            key={o.id}
            variant={item.chosenOptionId === o.id ? 'secondary' : 'outline'}
            disabled={item.chosenOptionId !== null}
            onClick={() => handlers.chooseOption(item.id, o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {item.branch.length > 0 && (
        <div className="mt-4 space-y-3">
          {item.branch.map((b) => (
            <RenderItem key={b.key} item={b} handlers={handlers} registerRef={registerRef} />
          ))}
        </div>
      )}
    </div>
  );
}

export function InteractiveLessonRenderer({
  doc,
  initialProgressState,
  onProgress,
  onReachedEnd,
}: {
  doc: JSONContent | null;
  initialProgressState: InteractiveProgressState | null;
  onProgress: (state: InteractiveProgressState) => void;
  onReachedEnd: (reached: boolean) => void;
}) {
  const [state, setState] = useState<InteractiveProgressState>(initialProgressState ?? EMPTY_STATE);

  // Persist on every real state change (skip the initial mount / resumed state).
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onProgressRef.current(state);
  }, [state]);

  const handlers: Handlers = {
    passGate: (id) => {
      setState((prev) =>
        prev.revealedGateIds.includes(id)
          ? prev
          : { ...prev, revealedGateIds: [...prev.revealedGateIds, id] },
      );
    },
    chooseOption: (checkpointId, optionId) => {
      setState((prev) =>
        prev.checkpointChoices[checkpointId]
          ? prev // fixed once chosen
          : { ...prev, checkpointChoices: { ...prev.checkpointChoices, [checkpointId]: optionId } },
      );
    },
  };

  const blocks = (doc?.content ?? []) as JSONContent[];
  const plan = buildRevealPlan(blocks, state);

  useEffect(() => {
    onReachedEnd(plan.complete);
  }, [plan.complete, onReachedEnd]);

  // The app sets a global `html { scroll-behavior: smooth }`. That makes the
  // browser *animate* its scroll-anchoring corrections — the instant, normally
  // invisible nudges it applies when content above the viewport changes height
  // (a reveal gate collapsing to a thin <hr>, a lesson image finishing loading).
  // Animated, those corrections play as a jarring "jump up, then settle down"
  // every time a student reveals a block. Force plain scroll behavior on the
  // scroll container while this lesson is mounted so anchoring corrections stay
  // instant/invisible again. Our own reveal scroll below passes behavior:'smooth'
  // explicitly, which overrides this and still animates.
  useEffect(() => {
    const targets = [document.documentElement, document.querySelector('main')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    const prev = targets.map((el) => el.style.scrollBehavior);
    targets.forEach((el) => {
      el.style.scrollBehavior = 'auto';
    });
    return () => {
      targets.forEach((el, i) => {
        el.style.scrollBehavior = prev[i] ?? '';
      });
    };
  }, []);

  // Refs to each rendered reveal item, keyed by item.key, so we can locate the
  // freshly revealed frontier after a reveal/choice.
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const registerRef = (key: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  };

  // After a reveal/choice (not on initial mount/resume), gently bring the TOP of
  // the first newly revealed block into comfortable view. We scroll DOWN-ONLY —
  // never yanking upward — and aim at the new content's top (not the page bottom),
  // so late-loading images below it can't skew the target.
  const prevKeysRef = useRef<string[] | null>(null);
  useEffect(() => {
    const keys = flattenKeys(plan.items);
    const prev = prevKeysRef.current;
    prevKeysRef.current = keys;
    if (prev === null) return; // initial mount / resumed state — don't scroll
    const firstNewKey = keys.find((k) => !prev.includes(k));
    if (!firstNewKey) return;

    // Small delay lets the new segment's read-only editor render its height first.
    const t = setTimeout(() => {
      const el = itemRefs.current.get(firstNewKey);
      if (!el) return;
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const target = window.scrollY + el.getBoundingClientRect().top - REVEAL_SCROLL_OFFSET;
      // Only scroll down, and only if it's a meaningful move — if the new content
      // is already comfortably in view, leave the scroll position alone.
      if (target > window.scrollY + 8) {
        window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
      }
    }, 70);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div className="interactive-lesson lesson-content max-w-none">
      {plan.items.map((item) => (
        <Fragment key={item.key}>
          <RenderItem item={item} handlers={handlers} registerRef={registerRef} />
        </Fragment>
      ))}
    </div>
  );
}
