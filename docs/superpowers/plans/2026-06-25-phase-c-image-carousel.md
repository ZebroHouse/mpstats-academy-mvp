# Plan · Phase C Feature 3 — Image Carousel block

Spec: `docs/superpowers/specs/2026-06-25-phase-c-image-carousel-design.md`
Branch: `feature/phase-c-content-tools`. Subagent TDD. Pure frontend (+ ai text-index). No backend, no migration, NEVER prisma.

Grounding (file:line):
- `extensions.ts:34` `lessonEditorExtensions` (shared editor+renderer). `LessonImage` (custom image node w/ width+align). Register the new node here.
- `interactive-nodes.ts` — `RevealGate` atom node template (Node.create, group:'block', atom:true, addAttributes parseHTML/renderHTML via data-attrs, addNodeView ReactNodeViewRenderer, addCommands insertX), `interactiveUid()` helper.
- `*NodeView.tsx` — NodeViewWrapper pattern, `updateAttributes`/`deleteNode`/`node.attrs`, `contentEditable={false}` on chrome. Check `editor.isEditable` to branch authoring vs student.
- `LessonEditor.tsx:49` `handleFile` — `trpc.admin.requestLessonImageUploadUrl.useMutation()` → `{uploadUrl, publicUrl}` → XHR PUT (Content-Type header) → use publicUrl. Constants in `packages/shared` (`LESSON_IMAGE_ALLOWED_MIME_TYPES/MAX_FILE_SIZE/STORAGE_BUCKET`). `toast` from `sonner`.
- `InteractiveToolbar.tsx` (button → `editor.chain().focus().insertX().run()`), `slash-menu.ts` (`items` array).
- `LessonBodyRenderer.tsx` (`useEditor({extensions: lessonEditorExtensions, editable:false, immediatelyRender:false})`) — node-views render here too (read-only branch).
- `text-index.ts:17` `extractPlainText` walker + `BLOCK_TYPES`.
- `globals.css:462` `.lesson-content` scoped styles; `overflow-x: clip` rule (lines 5-14) — DON'T use overflow-x:hidden.
- Test pattern: `tests/unit/lesson-body-renderer.test.tsx` (render TipTap JSON → assert DOM). ai test under `packages/ai/src/__tests__` or similar — find it.

## Task 1 — Carousel node + node-view + wiring + indexing (TDD)
**Files:**
- NEW `apps/web/src/components/admin/lesson-editor/carousel-node.ts` — the `ImageCarousel` node.
- NEW `apps/web/src/components/admin/lesson-editor/ImageCarouselNodeView.tsx` — the React node-view.
- EDIT `extensions.ts` (import + register `ImageCarousel`).
- EDIT `InteractiveToolbar.tsx` (button «🎞️ Галерея» → `insertImageCarousel`).
- EDIT `slash-menu.ts` (item «🎞️ Галерея фото» → `insertImageCarousel`).
- EDIT `packages/ai/src/text-index.ts` (imageCarousel → push image alts).
- EDIT `apps/web/src/styles/globals.css` (`.lesson-content .image-carousel*` styles).
- NEW tests: `apps/web/tests/unit/image-carousel.test.tsx`; ai text-index test (add a case to the existing extractPlainText test file).

### Node (`carousel-node.ts`)
Mirror `RevealGate` exactly. `Node.create({ name:'imageCarousel', group:'block', atom:true, selectable:true, draggable:true, addAttributes(){ return { id: <uid attr like idAttr>, images: { default: [], parseHTML: el => { try { return JSON.parse(el.getAttribute('data-images') ?? '[]'); } catch { return []; } }, renderHTML: attrs => ({ 'data-images': JSON.stringify(Array.isArray(attrs.images)? attrs.images : []) }) } }; }, parseHTML(){ return [{ tag: 'div[data-type="image-carousel"]' }]; }, renderHTML({HTMLAttributes}){ return ['div', mergeAttributes(HTMLAttributes, { 'data-type':'image-carousel' })]; }, addNodeView(){ return ReactNodeViewRenderer(ImageCarouselNodeView); }, addCommands(){ return { insertImageCarousel: () => ({commands}) => commands.insertContent({ type:'imageCarousel', attrs:{ id: interactiveUid(), images: [] } }) }; } })`. Reuse `interactiveUid` + the `idAttr` shape from interactive-nodes.ts (import them; export `interactiveUid`/`idAttr` if not already exported). Add a module augmentation for the command (`declare module '@tiptap/core'` interface Commands) like the existing interactive commands do — check how insertRevealGate is typed and mirror.

### Node-view (`ImageCarouselNodeView.tsx`)
`function ImageCarouselNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps)`. `const images = Array.isArray(node.attrs.images) ? node.attrs.images as {src:string;alt:string}[] : [];`
- ALWAYS call hooks first: `const requestUpload = trpc.admin.requestLessonImageUploadUrl.useMutation();` `const [index, setIndex] = useState(0);` `const [busy, setBusy] = useState(false);` (Rules of Hooks — unconditional).
- If `!editor.isEditable` → **student carousel** inside `<NodeViewWrapper className="image-carousel my-4" contentEditable={false}>`: if images.length===0 return wrapper empty/null; show `images[clampedIndex]` as `<img src alt>`; if length>1 show prev/next buttons (wrap-around: `(i-1+n)%n` / `(i+1)%n`), dot indicators, «k / n» counter; keyboard arrows (onKeyDown on a focusable container); simple touch swipe (onTouchStart/End threshold). Keep state in `index`.
- If editable → **authoring**: `<NodeViewWrapper className="image-carousel-editor ...">` with `contentEditable={false}` chrome: header «🎞️ Галерея фото» + «Удалить галерею» (deleteNode). A thumbnails row: each image = thumbnail + alt `<input>` (updateAttributes to edit that image's alt) + «×» remove (splice) + «◀»/«▶» move (swap with neighbor). An «+ Добавить фото» tile = a label wrapping a hidden `<input type="file" accept="image/*" multiple>`; on change loop files → for each: set busy, call the upload helper (mirror `handleFile`: `requestUpload.mutateAsync({filename,mimeType,fileSize})` → XHR PUT → publicUrl), append `{src:publicUrl, alt:''}` to images via `updateAttributes({ images: [...] })`; toast success/error; clear busy. Empty state text when no images.
- Extract a small pure helper for testability if useful (e.g. `nextIndex(i,n,dir)` wrap math) — unit-test it.
- Import `trpc` from the same path `LessonEditor.tsx` uses; `toast` from `sonner`.

### Wiring
- `extensions.ts`: `import { ImageCarousel } from './carousel-node';` add to array (after `LessonImage` or near interactive nodes).
- `InteractiveToolbar.tsx`: add a `<Button … onClick={() => editor.chain().focus().insertImageCarousel().run()}>🎞️ Галерея</Button>`.
- `slash-menu.ts`: add `{ title: '🎞️ Галерея фото', run: () => editor.chain().focus().insertImageCarousel().run() }` to the `all` array.

### Indexing
- `text-index.ts`: in `walk`, add `if (node.type === 'imageCarousel' && Array.isArray(node.attrs?.images)) { for (const img of node.attrs.images) { const alt = typeof img?.alt === 'string' ? img.alt.trim() : ''; if (alt) blocks.push(alt); } }` (before the generic content recursion; carousel is atom so no content). Keep additive.

### Styling
- `globals.css`: add `.lesson-content .image-carousel { … }`, `.image-carousel img { @apply rounded-lg max-h-[480px] w-auto mx-auto; }`, arrows/dots styles, `.image-carousel-editor` thumbnails strip (`overflow-x: auto` is fine for a horizontal thumb strip; do NOT set overflow-x:hidden on ancestors). Keep minimal + consistent.

### Tests
- `image-carousel.test.tsx`: (a) render `LessonBodyRenderer` with a doc containing an `imageCarousel` of 2 images → both `<img>` present OR the active one + 2 dots + prev/next buttons; with 1 image → no arrows. (Mock `@/lib/trpc/client` so the node-view's `useMutation` doesn't blow up — return a stub mutation. Mock `sonner`.) (b) pure `nextIndex` wrap helper if extracted. (c) optional: editable render shows «+ Добавить фото».
- ai test: extend the extractPlainText test (find it, e.g. `packages/ai/src/__tests__/text-index.test.ts`) with a case: doc with imageCarousel images having alts → output includes the alts.

Run: `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter @mpstats/web test -- image-carousel` + `pnpm --filter @mpstats/ai test` + `pnpm --filter @mpstats/web typecheck` + `pnpm --filter @mpstats/ai typecheck`. All green (ignore yandex-oauth flake). Also full `pnpm --filter @mpstats/web test` for no regressions. Do NOT commit.

## Verify
- Root `pnpm typecheck`, `pnpm --filter @mpstats/web test`, `pnpm --filter @mpstats/ai test` green.
- Manual: `pnpm dev`, admin lesson editor → insert «Галерея», add 2-3 images, save; open as student → carousel with arrows works. (Reuses prod `lesson-images` bucket — fine.)

## Deploy
Final Phase C feature → then the single staging→prod deploy for all 3 (next step). Carousel has no new tRPC, so the deploy is verified via the OTHER new procs' tRPC probe + a manual editor smoke.
