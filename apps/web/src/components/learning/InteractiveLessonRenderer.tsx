'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import type { JSONContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { LessonBodyRenderer } from './LessonBodyRenderer';
import { buildRevealPlan, type InteractiveProgressState, type RevealItem } from './interactive-reveal';

const EMPTY_STATE: InteractiveProgressState = { version: 1, revealedGateIds: [], checkpointChoices: {} };

interface Handlers {
  passGate: (id: string) => void;
  chooseOption: (checkpointId: string, optionId: string) => void;
}

function RenderItem({ item, handlers }: { item: RevealItem; handlers: Handlers }) {
  if (item.kind === 'segment') {
    return <LessonBodyRenderer doc={{ type: 'doc', content: item.blocks }} />;
  }
  if (item.kind === 'gate') {
    if (item.passed) return <hr className="my-6 border-mp-gray-100" />;
    return (
      <div className="my-6 flex justify-center">
        <Button size="lg" onClick={() => handlers.passGate(item.id)}>
          {item.label}
        </Button>
      </div>
    );
  }
  // checkpoint
  return (
    <div className="my-6">
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
        <div className="mt-4 space-y-2">
          {item.branch.map((b) => (
            <RenderItem key={b.key} item={b} handlers={handlers} />
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

  const update = useCallback(
    (next: InteractiveProgressState) => {
      setState(next);
      onProgress(next);
    },
    [onProgress],
  );

  const handlers: Handlers = {
    passGate: (id) => {
      if (state.revealedGateIds.includes(id)) return;
      update({ ...state, revealedGateIds: [...state.revealedGateIds, id] });
    },
    chooseOption: (checkpointId, optionId) => {
      if (state.checkpointChoices[checkpointId]) return; // fixed once chosen
      update({ ...state, checkpointChoices: { ...state.checkpointChoices, [checkpointId]: optionId } });
    },
  };

  const blocks = (doc?.content ?? []) as JSONContent[];
  const plan = buildRevealPlan(blocks, state);

  useEffect(() => {
    onReachedEnd(plan.complete);
  }, [plan.complete, onReachedEnd]);

  return (
    <div className="interactive-lesson lesson-content max-w-none">
      {plan.items.map((item) => (
        <Fragment key={item.key}>
          <RenderItem item={item} handlers={handlers} />
        </Fragment>
      ))}
    </div>
  );
}
