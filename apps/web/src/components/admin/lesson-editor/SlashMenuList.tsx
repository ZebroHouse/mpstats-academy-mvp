'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type SlashItem = { title: string; run: () => void };

export type SlashMenuRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export const SlashMenuList = forwardRef<SlashMenuRef, { items: SlashItem[] }>(
  function SlashMenuList({ items }, ref) {
    const [selected, setSelected] = useState(0);
    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          items[selected]?.run();
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;
    return (
      <div className="z-50 w-56 overflow-hidden rounded-lg border border-mp-gray-200 bg-white shadow-lg">
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            className={`block w-full px-3 py-2 text-left text-sm ${
              i === selected ? 'bg-mp-blue-50' : ''
            }`}
            onClick={() => item.run()}
          >
            {item.title}
          </button>
        ))}
      </div>
    );
  },
);
