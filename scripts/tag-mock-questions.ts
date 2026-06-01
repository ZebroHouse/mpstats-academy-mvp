// Phase 59-01 Task 3 — one-shot script to tag each mock question with marketplace.
// Per-question classification (id -> WB | OZON | BOTH) per D-07 of 59-CONTEXT.md.
// After applying, this script is committed as audit trail (and is harmless to re-run idempotently).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// Classification map: question id -> marketplace tag.
// Built by manual content audit (question + options + explanation) per D-07.
const TAGS: Record<string, 'WB' | 'OZON' | 'BOTH'> = {
  // ============== ANALYTICS (20) ==============
  // General theory dominates; no Ozon-only analytics questions in the mock set.
  'q-analytics-1': 'BOTH',   // доля рынка категории
  'q-analytics-2': 'BOTH',   // ABC-анализ
  'q-analytics-3': 'BOTH',   // оборачиваемость
  'q-analytics-4': 'BOTH',   // когортный анализ
  'q-analytics-5': 'BOTH',   // MPSTATS трекинг (tool, both MPs)
  'q-analytics-6': 'BOTH',   // sell-through rate
  'q-analytics-7': 'BOTH',   // сезонность по поисковым запросам
  'q-analytics-8': 'BOTH',   // перенасыщенность ниши
  'q-analytics-9': 'BOTH',   // упущенная выручка
  'q-analytics-10': 'BOTH',  // тип графика
  'q-analytics-11': 'BOTH',  // RFM-анализ
  'q-analytics-12': 'BOTH',  // конверсия формула
  'q-analytics-13': 'BOTH',  // период анализа трендов
  'q-analytics-14': 'BOTH',  // индекс видимости
  'q-analytics-15': 'BOTH',  // SEO эффективность
  'q-analytics-16': 'BOTH',  // кластерный анализ конкурентов
  'q-analytics-17': 'BOTH',  // средняя позиция
  'q-analytics-18': 'BOTH',  // каннибализация
  'q-analytics-19': 'BOTH',  // эффективность отзывов
  'q-analytics-20': 'BOTH',  // эластичность спроса

  // ============== MARKETING (20) ==============
  'q-marketing-1': 'BOTH',   // CTR formula — both
  'q-marketing-2': 'WB',     // тип РК на WB → WB
  'q-marketing-3': 'BOTH',   // ДРР — общий термин
  'q-marketing-4': 'BOTH',   // акции и ранжирование — оба
  'q-marketing-5': 'WB',     // мин бюджет рекламы на Wildberries
  'q-marketing-6': 'BOTH',   // ACOS — общий
  'q-marketing-7': 'WB',     // ранжирование выдачи WB
  'q-marketing-8': 'WB',     // ставка в рекламном аукционе WB
  'q-marketing-9': 'WB',     // запуск рекламы нового товара на WB
  'q-marketing-10': 'BOTH',  // выкупаемость — общий
  'q-marketing-11': 'WB',    // буст новинок на WB
  'q-marketing-12': 'OZON',  // Трафареты Ozon
  'q-marketing-13': 'BOTH',  // каскадная стратегия — общая
  'q-marketing-14': 'BOTH',  // SEO ↔ Quality Score — общий
  'q-marketing-15': 'WB',    // бренд-зона на WB
  'q-marketing-16': 'BOTH',  // расчёт ставки — формула CPM × ДРР
  'q-marketing-17': 'BOTH',  // самовыкупы — общая практика МП
  'q-marketing-18': 'BOTH',  // CTR vs конверсия — общая дилемма
  'q-marketing-19': 'BOTH',  // ретаргетинг — общий
  'q-marketing-20': 'BOTH',  // скорость доставки

  // ============== CONTENT (20) ==============
  'q-content-1': 'WB',       // главное фото на WB (размер 900x1200)
  'q-content-2': 'BOTH',     // характеристики карточки
  'q-content-3': 'BOTH',     // Rich-контент
  'q-content-4': 'BOTH',     // видео в карточке
  'q-content-5': 'BOTH',     // главное фото влияет на CTR
  'q-content-6': 'BOTH',     // макс. количество фото
  'q-content-7': 'BOTH',     // инфографика
  'q-content-8': 'BOTH',     // ключевые слова в описании
  'q-content-9': 'OZON',     // A+ контент Ozon (per D-07 example)
  'q-content-10': 'BOTH',    // фото с масштабным объектом
  'q-content-11': 'BOTH',    // название для SEO
  'q-content-12': 'BOTH',    // формат видео
  'q-content-13': 'BOTH',    // water-mark стратегия
  'q-content-14': 'BOTH',    // обновление контента
  'q-content-15': 'BOTH',    // UGC
  'q-content-16': 'BOTH',    // инфографика для сложных товаров
  'q-content-17': 'BOTH',    // структура описания
  'q-content-18': 'BOTH',    // сторителлинг
  'q-content-19': 'BOTH',    // фон фото одежды
  'q-content-20': 'BOTH',    // эффективность контента (A/B)

  // ============== OPERATIONS (20) ==============
  'q-operations-1': 'BOTH',  // FBO определение — общий концепт
  'q-operations-2': 'BOTH',  // страховой запас формула
  'q-operations-3': 'WB',    // out-of-stock на WB
  'q-operations-4': 'WB',    // 60-day склад WB
  'q-operations-5': 'WB',    // коэффициент приёмки WB
  'q-operations-6': 'BOTH',  // FBO vs FBS — общая концепция
  'q-operations-7': 'BOTH',  // объём первой поставки
  'q-operations-8': 'BOTH',  // кросс-докинг
  'q-operations-9': 'BOTH',  // оптимизация логистики FBO
  'q-operations-10': 'BOTH', // WMS
  'q-operations-11': 'BOTH', // снижение возвратов
  'q-operations-12': 'BOTH', // дефектура
  'q-operations-13': 'WB',   // баркод WB
  'q-operations-14': 'BOTH', // оборачиваемость склада
  'q-operations-15': 'BOTH', // сезонные поставки
  'q-operations-16': 'BOTH', // честный знак (общий регулятор)
  'q-operations-17': 'BOTH', // точка перезаказа формула
  'q-operations-18': 'BOTH', // мультискладская стратегия
  'q-operations-19': 'BOTH', // компенсация за потерянный товар
  'q-operations-20': 'BOTH', // оптимизация упаковки

  // ============== FINANCE (20) ==============
  'q-finance-1': 'BOTH',     // маржинальность формула
  'q-finance-2': 'BOTH',     // unit-экономика концепт
  'q-finance-3': 'WB',       // комиссия WB одежда
  'q-finance-4': 'BOTH',     // ROI
  'q-finance-5': 'BOTH',     // учёт возвратов
  'q-finance-6': 'BOTH',     // точка безубыточности
  'q-finance-7': 'WB',       // чистая прибыль на WB (mentions WB by name)
  'q-finance-8': 'BOTH',     // cash flow
  'q-finance-9': 'BOTH',     // наценка
  'q-finance-10': 'BOTH',    // SKU-экономика
  'q-finance-11': 'WB',      // как WB удерживает комиссию
  'q-finance-12': 'BOTH',    // замороженные деньги
  'q-finance-13': 'BOTH',    // налоговый режим
  'q-finance-14': 'BOTH',    // окупаемость
  'q-finance-15': 'BOTH',    // финансовая подушка
  'q-finance-16': 'BOTH',    // акции и unit-экономика
  'q-finance-17': 'BOTH',    // LTV
  'q-finance-18': 'BOTH',    // УСН 6 vs 15
  'q-finance-19': 'BOTH',    // себестоимость из Китая
  'q-finance-20': 'BOTH',    // кассовый разрыв
};

// Only questions.ts is in plan scope (D-07 of 59-CONTEXT.md).
// questions.generated.ts is a stale 2026-02-18 draft, not exported from mocks/index.ts
// and excluded from tsc via packages/api/tsconfig.json exclude list to avoid an
// out-of-scope tagging pass on content we did not audit.
const TARGETS = [
  path.join(__dirname, '..', 'packages', 'api', 'src', 'mocks', 'questions.ts'),
];

async function tagFile(filePath: string) {
  const text = await fs.readFile(filePath, 'utf8');

  // For each id, insert `marketplace: '<X>',` line right after `skillCategory: 'X' as SkillCategory,`.
  // Anchor: the question block boundaries are id-> next id, so we use a per-question regex over the block.
  const lines = text.split('\n');
  const out: string[] = [];
  let currentId: string | null = null;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/^\s*id:\s*'([^']+)',/);
    if (idMatch) {
      currentId = idMatch[1];
    }
    out.push(line);
    const skillMatch = line.match(/^(\s*)skillCategory:\s*'[A-Z]+'\s*as\s*SkillCategory,\s*$/);
    if (skillMatch && currentId) {
      // Check next non-empty line — skip if marketplace already present (idempotent).
      const next = lines[i + 1] ?? '';
      if (/marketplace:\s*'(WB|OZON|BOTH)'/.test(next)) {
        skipped++;
      } else {
        const tag = TAGS[currentId];
        if (!tag) {
          throw new Error(`No tag in TAGS map for id=${currentId}`);
        }
        out.push(`${skillMatch[1]}marketplace: '${tag}',`);
        inserted++;
      }
      currentId = null;
    }
  }

  await fs.writeFile(filePath, out.join('\n'), 'utf8');
  return { file: path.basename(filePath), inserted, skipped };
}

async function main() {
  for (const target of TARGETS) {
    try {
      const stats = await tagFile(target);
      console.log(JSON.stringify(stats, null, 2));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`skip (missing): ${target}`);
        continue;
      }
      throw err;
    }
  }

  // Per-axis × per-marketplace tally (questions.ts only — generated.ts shares id namespace
  // so its distribution is identical at the id-key level).
  const tally: Record<string, Record<string, number>> = {};
  for (const [id, mkp] of Object.entries(TAGS)) {
    const axis = id.split('-')[1].toUpperCase();
    tally[axis] ??= { WB: 0, OZON: 0, BOTH: 0 };
    tally[axis][mkp] += 1;
  }
  console.log('Per-axis tally (mock content audit per D-07):');
  console.table(tally);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
