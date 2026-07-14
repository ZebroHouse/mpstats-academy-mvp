# AI-ассистент — Material-surfacing (подмешивание материалов из базы знаний) — дизайн

**Дата:** 2026-07-14
**Статус:** дизайн принят, готов к плану
**Ветка:** `feature/ai-assistant` (worktree `.claude/worktrees/ai-assistant`), поверх концьерж-слоя v1.1
**Предшественники:** концьерж-спека `docs/superpowers/specs/2026-07-13-assistant-concierge-design.md` + план `docs/superpowers/plans/2026-07-13-assistant-concierge.md` (реализован, НЕ протестирован на staging)

---

## 1. Контекст и цель

Сейчас сквозной AI-ассистент отдаёт карточками только **уроки** (из RAG-чанков) и **задачи** (джобы), а концьерж — **нав-ссылки**. **Материалы** (`Material`: презентации, таблицы, чек-листы, памятки, внешние сервисы) — отдельная сущность, привязанная к урокам через `LessonMaterial`, — ассистент не находит и не показывает. Их вообще нет в векторном индексе (эмбеддятся только уроки).

**Цель:** ассистент проактивно подмешивает релевантные материалы из базы знаний **по назначению** (исходя из смысла запроса, не по точному названию) — карточкой в чате, рядом с уроками/задачами. Юзер спрашивает «как считать юнит-экономику» → получает урок + таблицу-калькулятор/чек-лист по теме.

**Ключевое ограничение (owner):** материалов на один урок может быть несколько → суммарно их больше уроков. Нельзя превращать ответ в «стену материалов» — нужен жёсткий кап + приоритизация.

---

## 2. Ключевые решения (из брейншторма)

| # | Решение | Выбор |
|---|---------|-------|
| 1 | Триггер | **Проактивно**, в `material`-ветке ассистента (бизнес-вопросы), рядом с уроками/задачами. НЕ в `platform_help`/`off_domain`/`complaint`. |
| 2 | Охват | Материалы, привязанные к урокам (`LessonMaterial`), `isHidden=false`. Standalone (`isStandalone`, dormant) — вне скоупа. |
| 3 | Анти-спам | Ретрив top-K выше порога → **синтез выбирает ≤2 материала** на ответ (whitelist + строгий промпт). Дедуп по materialId. |
| 4 | Индексация | **`Material.embedding vector(1536)` в БД** (зеркалит `Job.embedding`), re-embed скриптом. НЕ в репо (живой контент). |
| 5 | Гейтинг доступа | Карточка всегда; доступен ⟺ ≥1 родительский урок доступен. Доступен → открыть/скачать; залочен → замок + CTA `/billing`. URL залоченных не отдаётся. |
| 6 | Тип карточки | Новый `AssistantMaterialRef`: иконка по типу + title + `ctaText`; external → «Открыть», file → «Скачать» (`getSignedUrl`), locked → paywall. |

---

## 3. Индексация материалов

### Схема (аддитивно)
`Material.embedding vector(1536)?` + ivfflat cosine index (как `Job.embedding` из Track B, миграция `20260522000000_add_job_embedding` — образец).

### Скрипт эмбеддинга
`packages/ai/src/assistant/materials/embed-materials.ts` (по образцу `packages/ai/src/intent/embed-jobs.ts`):
- Текст для эмбеддинга: `title` + `description` + человекочитаемый тип-лейбл (напр. «чек-лист», «таблица-калькулятор») + опц. названия родительских уроков (контекст релевантности).
- `$executeRawUnsafe UPDATE "Material" SET embedding = '[...]'::vector WHERE id = ...`.
- Идемпотентно (`--force` для переэмбеддинга); пропускает `isHidden=true`.
- Запуск: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server ...`.
- **Backfill** всех существующих non-hidden материалов при первом прогоне.
- Re-embed при добавлении/правке материалов методологами (going-forward, вручную/по процедуре как `embed-jobs`).

---

## 4. Ретрив материалов

`searchMaterialsByEmbedding(query, {limit, threshold})` — новый модуль `packages/ai/src/assistant/materials/retrieve-materials.ts` (зеркало `searchJobsByEmbedding`):
- `embedQuery(query)` → cosine-поиск по `Material.embedding` (raw SQL, `<=>`), только `isHidden=false` и `embedding IS NOT NULL`.
- Возвращает `MaterialCandidate[]` (materialId, type, title, description, ctaText, similarity), отсортированные по similarity, срез `limit`.
- Порог отсечки (~0.3-0.4, калибруется) — слабые матчи не проходят.

Интеграция в `retrieve.ts`:
- `retrieveForAssistant` расширяется: параллельно к lessons+jobs добавляется `retrieveMaterials(query)` (K≈6, порог). Возвращает `materials: MaterialCandidate[]` в `AssistantRetrieval`.
- **Только для `material`-ветки** — пайплайн вызывает материал-ретрив лишь когда `category==='material'` (или `complaint`, которая ведёт себя как material? — НЕТ: материалы только для чистого material; complaint не подмешивает материалы, чтобы не отвлекать от жалобы). Уточнение: материалы гоняются, когда идёт материальная ветка синтеза (category `material`). `complaint` в v1 ведёт себя как material поведенчески, но материалы ему НЕ подмешиваем — гейт по `category==='material'`.

> Реализационно: `runAssistantPipeline` для `material` зовёт retrieve с материалами; для `complaint` — retrieve уроков/задач без материалов. Проще всего: параметр `withMaterials: category === 'material'` в retrieve.

---

## 5. Синтез + whitelist (анти-спам + anti-hallucination)

`synthesize.ts` (материальная ветка):
- В контекст LLM добавляется список КАНДИДАТОВ-МАТЕРИАЛОВ (id + title + тип), как уже делается для уроков/задач.
- LLM-схема расширяется: `materialIds: string[]`.
- **Строгий промпт:** «Материалы подмешивай ТОЛЬКО если прямо в тему или юзер просит; **максимум 1–2**, не вываливай все; не выдумывай id — только из списка кандидатов; в тексте ответа материалы/id не упоминай (как с уроками)».
- Whitelist: `materialIds` фильтруются по множеству кандидатов (как `lessonIds`/`jobIds`), дедуп, срез до 2.

---

## 6. Доступ + карточка

### Резолвинг доступа (сервер)
Материал доступен ⟺ у юзера доступен **хотя бы один** родительский урок (через `LessonMaterial` → `Lesson`, реюз `isLessonAccessible` + `getFirstJobLessonIds`-логики из access.ts). Пакетно (без N+1): один pre-fetch привязок + подписок.

### Контракт (`packages/ai/src/assistant/types.ts`)
```ts
export interface AssistantMaterialRef {
  materialId: string;
  type: string;              // MaterialType
  title: string;
  ctaText: string;
  isAccessible: boolean;
  externalUrl: string | null;   // только если isAccessible && тип external/externalUrl; иначе null
  hasFile: boolean;             // storagePath присутствует (скачивание через getSignedUrl)
}
// AssistantTurnResult / AssistantBranchResult += materials: AssistantMaterialRef[]
```
- Для **залоченных** материалов `externalUrl=null`, фронт показывает замок + CTA `/billing` (URL не течёт).
- Резолвинг доступа делает **роутер** (`assistant.ts`) при отдаче — и в `sendMessage`-результате, и в `getConversation` (**пересчёт при чтении**: после оплаты залоченное открывается).

### Карточка (`AssistantCards.tsx`)
Новый вариант рядом с уроком/задачей/нав-ссылкой:
- Иконка по `type` (презентация/таблица/чеклист/памятка/сервис).
- title + `ctaText`.
- `isAccessible && externalUrl` → `<a target="_blank">` «Открыть».
- `isAccessible && hasFile` → кнопка «Скачать» → вызывает `material.getSignedUrl({materialId})` → открывает signed URL.
- `!isAccessible` → замок + «Оформить доступ» → `/billing`.
- propose→click; сердечко-избранное для материалов — реюз `FavoriteButton itemType="MATERIAL"` (Favorite уже полиморфна и поддерживает MATERIAL).

---

## 7. Персист + история

- Аддитивная колонка `AssistantMessage.materialIds String[] @default([])`.
- Персист: `materialIds: result.materials.map(m => m.materialId)`.
- `getConversation`: собрать все materialIds → `prisma.material.findMany` (non-hidden) + резолвинг доступа (пересчёт) → `AssistantMaterialRef[]` в `EnrichedMessage`.
- Фронт (`AssistantConversation`): `UiMessage += materials`; гидрация + onSuccess прокидывают; `<AssistantCards materials=... />`.

---

## 8. Тесты (TDD)

- **retrieve-materials:** ранжирование по similarity, порог отсечки, срез K; only non-hidden/embedding-not-null.
- **synthesize:** whitelist materialIds (только из кандидатов), кап ≤2, anti-hallucination (ghost id выброшен), материалы не текут в текст.
- **access resolver:** доступен ⟺ ≥1 родительский урок доступен; залоченный → `isAccessible=false`, `externalUrl=null`.
- **pipeline:** материалы подмешиваются ТОЛЬКО в `material`-ветке; `platform_help`/`off_domain`/`complaint` → `materials=[]`.
- **card render:** open (external) / download (file) / locked (paywall) — 3 состояния.
- **getConversation:** пересчёт доступа при чтении (залочено→оплачено→открыто).
- **embed-materials:** buildMaterialText (title+desc+type[+lessons]); pure-часть.

---

## 9. Миграции и деплой

- **Аддитивные миграции (Mgmt API):** `Material.embedding vector(1536)` + ivfflat index; `AssistantMessage.materialIds String[] @default([])`.
- **Backfill:** прогнать `embed-materials.ts` по всем non-hidden материалам (на staging/prod, embedding-only, дёшево).
- **Совместно с концьерж-миграцией:** концьерж-миграция (`category`+`navLinks`) ещё НЕ прогнана на staging/prod. Все миграции (концьерж + материалы) прогоняются на staging ВМЕСТЕ, одним заходом, перед общим UAT.
- Прод — по-прежнему пакетом v1.0 + концьерж + материалы, флаг `ASSISTANT_ENABLED` включается отдельно. Откат: revert merge (миграции аддитивны, безвредны).

---

## 10. Вне скоупа

- Standalone-материалы (`isStandalone`) — dormant, не трогаем.
- Материалы в чате ВНУТРИ урока (in-lesson assistant) — только сквозной ассистент.
- Отдельная детекция «явного запроса материала» — делаем проактивно, без спец-интента.
- Извлечение/индексация СОДЕРЖИМОГО файлов материала — эмбеддим только метаданные (title/description/type). Полнотекст — будущая итерация при нужде.

---

## 11. Риски

- **Спам материалами** — митигация: порог ретрива + кап ≤2 + строгий промпт + дедуп. Калибровать на реальных запросах.
- **Релевантность по метаданным** — материалы эмбеддятся по title+description (коротко); если описания скудны — матч слабее. Митигация: добавить тип-лейбл + названия родительских уроков в текст эмбеддинга; при нужде — полнотекст (вне скоупа v1).
- **Дрейф доступа** — доступ пересчитывается при чтении, не кешируется в materialIds. ОК.
- **Рост числа материалов** — вектор в БД + ivfflat масштабируется (как jobs/lessons).
