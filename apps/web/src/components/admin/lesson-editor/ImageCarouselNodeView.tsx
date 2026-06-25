'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import type { KeyboardEvent, TouchEvent } from 'react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';

type CarouselImage = { src: string; alt: string };

// Pure wrap-around index math (extracted for unit testing). dir = -1 (prev) | +1 (next).
export function nextIndex(i: number, n: number, dir: number): number {
  if (n <= 0) return 0;
  return ((i + dir) % n + n) % n;
}

const SWIPE_THRESHOLD = 40;

export function ImageCarouselNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const images: CarouselImage[] = Array.isArray(node.attrs.images)
    ? (node.attrs.images as CarouselImage[])
    : [];

  // Hooks unconditional (Rules of Hooks) — the upload mutation is only invoked in
  // the editable branch, harmless on student pages where it's never called.
  const requestUpload = trpc.admin.requestLessonImageUploadUrl.useMutation();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // ===== Student carousel (read-only) =====
  if (!editor.isEditable) {
    if (images.length === 0) {
      return <NodeViewWrapper className="image-carousel my-4" contentEditable={false} />;
    }
    const n = images.length;
    const active = images[Math.min(index, n - 1)];
    const go = (dir: number) => setIndex((i) => nextIndex(i, n, dir));

    return (
      <NodeViewWrapper
        className="image-carousel my-4"
        contentEditable={false}
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        }}
        onTouchStart={(e: TouchEvent<HTMLDivElement>) => setTouchStartX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e: TouchEvent<HTMLDivElement>) => {
          if (touchStartX === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
          if (Math.abs(dx) >= SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
          setTouchStartX(null);
        }}
      >
        <div className="image-carousel-stage">
          {n > 1 && (
            <button
              type="button"
              aria-label="Предыдущее фото"
              className="image-carousel-arrow image-carousel-arrow-prev"
              onClick={() => go(-1)}
            >
              ‹
            </button>
          )}
          <img src={active.src} alt={active.alt ?? ''} />
          {n > 1 && (
            <button
              type="button"
              aria-label="Следующее фото"
              className="image-carousel-arrow image-carousel-arrow-next"
              onClick={() => go(1)}
            >
              ›
            </button>
          )}
        </div>
        {n > 1 && (
          <div className="image-carousel-footer">
            <div className="image-carousel-dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Фото ${i + 1}`}
                  className={`image-carousel-dot${i === Math.min(index, n - 1) ? ' is-active' : ''}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <span className="image-carousel-counter">
              {Math.min(index, n - 1) + 1} / {n}
            </span>
          </div>
        )}
      </NodeViewWrapper>
    );
  }

  // ===== Authoring chrome (editable) =====
  const setImages = (next: CarouselImage[]) => updateAttributes({ images: next });

  const removeAt = (i: number) => setImages(images.filter((_, idx) => idx !== i));

  const setAltAt = (i: number, alt: string) =>
    setImages(images.map((img, idx) => (idx === i ? { ...img, alt } : img)));

  const moveBy = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };

  const uploadFiles = async (files: FileList) => {
    setBusy(true);
    const appended: CarouselImage[] = [];
    for (const file of Array.from(files)) {
      try {
        const { uploadUrl, publicUrl } = await requestUpload.mutateAsync({
          filename: file.name,
          mimeType: file.type as never,
          fileSize: file.size,
        });
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`HTTP ${xhr.status}`));
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });
        appended.push({ src: publicUrl, alt: '' });
      } catch (e) {
        toast.error('Ошибка загрузки картинки: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
    if (appended.length > 0) {
      // Read the CURRENT images off node.attrs (not the closure-captured `images`),
      // so concurrent alt/remove edits during the async upload aren't clobbered.
      const current = Array.isArray(node.attrs.images) ? (node.attrs.images as CarouselImage[]) : [];
      setImages([...current, ...appended]);
      toast.success(appended.length > 1 ? `Загружено фото: ${appended.length}` : 'Картинка загружена');
    }
    setBusy(false);
  };

  return (
    <NodeViewWrapper className="image-carousel-editor my-4" contentEditable={false}>
      <div className="image-carousel-editor-head">
        <span className="text-sm font-medium text-mp-gray-700">🎞️ Галерея фото</span>
        <button type="button" className="text-sm text-red-500" onClick={() => deleteNode()}>
          Удалить галерею
        </button>
      </div>

      {images.length === 0 && (
        <p className="image-carousel-editor-empty">Добавьте фото в галерею</p>
      )}

      <div className="image-carousel-thumbs">
        {images.map((img, i) => (
          <div key={i} className="image-carousel-thumb">
            <img src={img.src} alt={img.alt ?? ''} />
            <input
              className="image-carousel-thumb-alt"
              value={img.alt ?? ''}
              placeholder="Описание (alt)"
              onChange={(e) => setAltAt(i, e.target.value)}
            />
            <div className="image-carousel-thumb-actions">
              <button type="button" aria-label="Левее" disabled={i === 0} onClick={() => moveBy(i, -1)}>
                ◀
              </button>
              <button
                type="button"
                aria-label="Правее"
                disabled={i === images.length - 1}
                onClick={() => moveBy(i, 1)}
              >
                ▶
              </button>
              <button type="button" aria-label="Удалить фото" className="text-red-500" onClick={() => removeAt(i)}>
                ×
              </button>
            </div>
          </div>
        ))}

        <label className="image-carousel-add">
          <span>{busy ? 'Загрузка…' : '+ Добавить фото'}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) void uploadFiles(files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </NodeViewWrapper>
  );
}
