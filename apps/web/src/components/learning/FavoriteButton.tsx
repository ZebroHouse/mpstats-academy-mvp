'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export type FavoriteItemType = 'LESSON' | 'JOB' | 'MATERIAL';

/**
 * Shared optimistic «сердечко» toggle (UI-SPEC §5, D-06).
 *
 * - Toggles `favorite.add` / `favorite.remove` by current state, optimistically:
 *   `onMutate` flips the heart, `onError` rolls back + toasts, `onSettled`
 *   invalidates `favorite.isFavorited` + `favorite.list`.
 * - off = outline `text-mp-gray-400`; on = filled `mp-pink-500` (A5).
 * - `aria-pressed` + aria-label «Добавить в избранное» / «Убрать из избранного».
 * - `min-h-11 min-w-11` tap target; `Heart w-5 h-5`.
 * - When mounted inside a `<Link>` card, `e.preventDefault()` + `e.stopPropagation()`
 *   keep the click from navigating (JobCard click-inside-card guard pattern).
 * - No confirm dialog.
 *
 * Rules of Hooks (CLAUDE.md gotcha): ALL `useMutation`/`useUtils` are above any
 * early return — there are no early returns here at all.
 */
export function FavoriteButton({
  itemType,
  itemId,
  initialFavorited = false,
  className,
}: {
  itemType: FavoriteItemType;
  itemId: string;
  initialFavorited?: boolean;
  className?: string;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.favorite.isFavorited.invalidate();
    void utils.favorite.list.invalidate();
  };

  const addMutation = trpc.favorite.add.useMutation({
    onMutate: () => {
      const prev = favorited;
      setFavorited(true);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) setFavorited(ctx.prev);
      toast.error('Не удалось обновить избранное. Попробуйте ещё раз.');
    },
    onSettled: invalidate,
  });

  const removeMutation = trpc.favorite.remove.useMutation({
    onMutate: () => {
      const prev = favorited;
      setFavorited(false);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) setFavorited(ctx.prev);
      toast.error('Не удалось обновить избранное. Попробуйте ещё раз.');
    },
    onSettled: invalidate,
  });

  const pending = addMutation.isPending || removeMutation.isPending;

  const handleClick = (e: React.MouseEvent) => {
    // Card is usually a <Link> — don't navigate / bubble.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    if (favorited) {
      removeMutation.mutate({ itemType, itemId });
    } else {
      addMutation.mutate({ itemType, itemId });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? 'Убрать из избранного' : 'Добавить в избранное'}
      className={cn(
        'inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg',
        'transition-colors disabled:opacity-50 hover:bg-mp-gray-50',
        className,
      )}
    >
      <Heart
        className={cn(
          'w-5 h-5 transition-colors',
          favorited ? 'fill-mp-pink-500 text-mp-pink-500' : 'text-mp-gray-400',
        )}
      />
    </button>
  );
}
