/**
 * Seller-lexicon query expansion.
 *
 * Sellers ask questions in shorthand — «опиши анализ ЦА», «снизить ДРР», «поднять
 * CTR». The embedding model does not equate «ЦА» with «целевая аудитория», so a
 * terse abbreviated query can score below the retrieval floor against content that
 * actually covers the topic. This util detects known marketplace-seller
 * abbreviations/terms and appends their expansion inline, in parentheses, right
 * after each occurrence — so the embedded query carries BOTH the seller's shorthand
 * and the canonical wording the transcripts use.
 *
 * Apply it ONLY to the string that goes into the embedding (lesson chat retrieval,
 * /learn vector search, intent). The user-facing message, the question sent to the
 * LLM, and keyword `contains` matching keep the original text.
 *
 * Mirror of fixBrandNames (generation.ts) but on the way IN. Dictionary seeded from
 * docs/obshchiy_glossariy_sellera_2026.docx + standard marketplace lexicon.
 */

interface LexiconEntry {
  /** Surface forms to match (case-insensitive, whole-token). */
  aliases: string[];
  /** Canonical expansion appended in parentheses. No inner parens. */
  expansion: string;
}

// High-confidence, unambiguous seller terms only. Ambiguous/noisy short tokens are
// deliberately excluded to avoid false expansions.
const LEXICON: LexiconEntry[] = [
  { aliases: ['ЦА'], expansion: 'целевая аудитория' },
  { aliases: ['ДРР', 'DRR'], expansion: 'доля рекламных расходов' },
  { aliases: ['РК'], expansion: 'рекламная кампания' },
  { aliases: ['ЛК'], expansion: 'личный кабинет' },
  { aliases: ['УТП'], expansion: 'уникальное торговое предложение' },
  { aliases: ['СПП'], expansion: 'скидка постоянного покупателя' },
  { aliases: ['СТМ'], expansion: 'собственная торговая марка' },
  { aliases: ['ВП'], expansion: 'валовая прибыль' },
  { aliases: ['ЧП'], expansion: 'чистая прибыль' },
  { aliases: ['юнитка'], expansion: 'юнит-экономика' },
  { aliases: ['неликвид'], expansion: 'зависшие неликвидные остатки' },
  { aliases: ['органика'], expansion: 'бесплатный поисковый трафик' },
  { aliases: ['склейка'], expansion: 'объединение карточек товара' },
  { aliases: ['CTR'], expansion: 'кликабельность, отношение кликов к показам' },
  { aliases: ['CR'], expansion: 'конверсия' },
  { aliases: ['CPO'], expansion: 'стоимость заказа' },
  { aliases: ['CPC'], expansion: 'цена клика' },
  { aliases: ['CPM'], expansion: 'цена за тысячу показов' },
  { aliases: ['CPA'], expansion: 'цена целевого действия' },
  { aliases: ['ROI'], expansion: 'возврат инвестиций' },
  { aliases: ['ROMI'], expansion: 'окупаемость рекламных инвестиций' },
  { aliases: ['SKU'], expansion: 'товарная позиция, артикул' },
  { aliases: ['FBO'], expansion: 'продажа со склада маркетплейса' },
  { aliases: ['FBS'], expansion: 'продажа со склада продавца' },
  { aliases: ['DBS'], expansion: 'доставка силами продавца' },
  { aliases: ['P&L', 'PnL'], expansion: 'отчёт о прибылях и убытках' },
  { aliases: ['KPI'], expansion: 'ключевые показатели эффективности' },
  { aliases: ['SEO'], expansion: 'поисковая оптимизация' },
  { aliases: ['LTV'], expansion: 'пожизненная ценность клиента' },
  { aliases: ['AOV'], expansion: 'средний чек' },
  { aliases: ['WB'], expansion: 'Wildberries' },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Expand known seller abbreviations in a query for embedding/retrieval.
 * Returns the query unchanged when it is empty or contains no known term.
 */
export function expandSellerQuery(query: string): string {
  if (!query.trim()) return query;

  let out = query;
  for (const { aliases, expansion } of LEXICON) {
    // Skip if the expansion is already written out somewhere in the query
    // (avoids «целевая аудитория ЦА (целевая аудитория)»). Also prevents a second
    // alias of the same entry from expanding twice once the first one inserted it.
    if (out.toLowerCase().includes(expansion.toLowerCase())) continue;

    for (const alias of aliases) {
      // Whole-token match. Cyrillic is not recognised by \b, so use Unicode-aware
      // lookaround on letters/digits — prevents «ЦА» matching inside «цапля».
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])(${escapeRegex(alias)})(?![\\p{L}\\p{N}])`,
        'iu',
      );
      if (re.test(out)) {
        // Replace only the first occurrence: one expansion per term is enough.
        out = out.replace(re, `$1 (${expansion})`);
        break;
      }
    }
  }
  return out;
}
