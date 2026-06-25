# Phase C · Feature 3 — Image Carousel block (lesson editor)

**Date:** 2026-06-25
**Status:** spec
**Builds on:** Phase A/B lesson editor (TipTap v3, shared `lessonEditorExtensions`).

## Goal

A methodologist can insert an **image gallery / carousel** (multiple images, navigated by arrows/dots) into a text or interactive lesson. Authored in the editor; students see a swipeable/arrow carousel. **Pure frontend — no backend, no migration** (images live in the TipTap body Json; reuse the existing single-image upload).

## Architecture (from grounding)
- `lessonEditorExtensions` (`extensions.ts`) is the SINGLE shared extension list used by the editor (`LessonEditor`, editable) AND the read-only `LessonBodyRenderer` (and thus interactive-lesson segments). A node registered there renders in both.
- An **atom block node** with a React node-view (`ReactNodeViewRenderer`) renders via the node-view in BOTH editable and read-only modes. So the node-view branches on `editor.isEditable`:
  - **editable** → authoring chrome (add image via upload, remove, reorder, edit alt).
  - **read-only** → the student carousel (one image visible, prev/next arrows, dot indicators, keyboard/swipe).
- Image upload: reuse `admin.requestLessonImageUploadUrl` (signed PUT to bucket `lesson-images`, returns `{uploadUrl, publicUrl}`) + the `XMLHttpRequest` PUT helper from `LessonEditor.handleFile`. Constants `LESSON_IMAGE_ALLOWED_MIME_TYPES / MAX_FILE_SIZE / STORAGE_BUCKET` in `packages/shared`.

## Scope

### IN
1. **`ImageCarousel` TipTap node** (`apps/web/src/components/admin/lesson-editor/interactive-nodes.ts` or a new `carousel-node.ts`): `name: 'imageCarousel'`, `group: 'block'`, `atom: true`, `selectable`, `draggable`. Attrs: `id` (uid) + `images` (array of `{ src: string, alt: string }`) with `parseHTML`/`renderHTML` round-tripping via a `data-images` JSON attribute (+ `data-type="image-carousel"`). `addCommands().insertImageCarousel()` inserts an empty carousel (`images: []`). `addNodeView()` → `ReactNodeViewRenderer(ImageCarouselNodeView)`.
2. **`ImageCarouselNodeView.tsx`**: branches on `props.editor.isEditable`.
   - **Authoring:** a horizontal strip of image thumbnails; per-thumb: alt-text input, remove (×), move left/right; an «+ Добавить фото» tile that opens a file picker → upload (reuse the upload helper) → append `{src, alt:''}` to `images` via `updateAttributes`. Empty state «Добавьте фото в галерею». «Удалить галерею» (deleteNode). Multiple uploads allowed (loop over selected files). Loading state per upload + error toast (sonner).
   - **Read-only (student):** a carousel — show one image at a time, prev/next arrows (disabled at ends OR wrap — pick wrap), dot indicators, current index, alt as `alt`/caption, click/keyboard left-right, basic touch swipe. Single image → no arrows/dots. Zero images → render nothing.
3. **Register** `ImageCarousel` in `lessonEditorExtensions` (`extensions.ts`).
4. **Toolbar button** in `InteractiveToolbar.tsx`: «🎞️ Галерея» → `insertImageCarousel`. **Slash item** in `slash-menu.ts`: «🎞️ Галерея фото».
5. **`extractPlainText`** (`packages/ai/src/text-index.ts`): add an `imageCarousel` case that pushes each image's non-empty `alt` as a block (so gallery captions are searchable/visible to AI chat). Additive; keep existing behavior.
6. **Styling** in `globals.css` under `.lesson-content` (`.image-carousel*`): carousel layout, thumbnails strip, arrows/dots. Use `overflow-x: clip` (NOT hidden) anywhere clipping is needed (app-wide sticky rule).

### OUT
- No backend, no new tRPC, no migration (reuse existing upload mutation).
- No captions-as-rich-text (alt is a plain string; sufficient).
- No reveal/branch logic on the carousel (it's static content; works inside revealed segments automatically).
- No reordering by drag-drop (left/right buttons suffice).
- No per-image crop/resize (single-image resize stays a separate existing feature).

## Edge cases
- 0 images: editor shows empty-state + add tile; student render = nothing (or skip).
- 1 image: student shows the image, no arrows/dots.
- Upload failure: toast, image not appended; other images unaffected.
- Non-image / oversize file: blocked by the existing mutation's zod (mimeType enum + size) → error toast.
- Malformed `images` attr (not array) on read: treat as empty.
- The node-view's upload mutation hook is created in both modes (Rules of Hooks) but only invoked in the editable branch — harmless on student pages (trpc client is globally available; never called).
- `data-images` JSON parse failure in parseHTML → `images: []`.

## Acceptance
- Node JSON round-trips: a doc with an `imageCarousel` (2 images) renders 2 `<img>` reachable in `LessonBodyRenderer` (read-only) test; arrows present for >1, absent for 1.
- `extractPlainText` surfaces image `alt` text (unit test in packages/ai).
- Editor: inserting via command produces an empty carousel node; (light) node-view authoring render test if feasible (upload mocked).
- `pnpm typecheck` (all) + `pnpm test` (web + ai) green; no regressions (existing `lesson-body-renderer.test.tsx`, interactive-node tests).

## Files (anticipated)
- NEW `apps/web/src/components/admin/lesson-editor/ImageCarouselNodeView.tsx`.
- EDIT `apps/web/src/components/admin/lesson-editor/interactive-nodes.ts` (or NEW `carousel-node.ts`) — node def.
- EDIT `extensions.ts` (register), `InteractiveToolbar.tsx` (button), `slash-menu.ts` (item).
- EDIT `packages/ai/src/text-index.ts` (alt indexing) + test.
- EDIT `apps/web/src/styles/globals.css` (carousel styles).
- Tests: `apps/web/tests/unit/image-carousel.test.tsx` + ai text-index test.
