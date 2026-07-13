export interface BaseMapEntry {
  id: string;              // стабильный слаг
  triggers: string[];      // перефразировки для матча (эмбеддятся)
  section: string;         // аналитика: 'billing' | 'referral' | 'diagnostic' | 'navigation' | 'catalog' | 'meta' | ...
  showInFaq?: boolean;     // рендерить на /support
}

export interface StaticMapEntry extends BaseMapEntry {
  kind: 'static';
  answer: string;                              // КАНОНИЧЕСКИЙ текст (grounding-источник)
  deepLink?: { label: string; href: string };
}

export interface DynamicMapEntry extends BaseMapEntry {
  kind: 'dynamic';
  resolver: 'courseFacts';                     // ключ живого резолвера
}

export type MapEntry = StaticMapEntry | DynamicMapEntry;

// Одна запись embeddings.ts.
export interface MapEmbedding {
  id: string;
  vec: number[];
}

// Результат матча.
export interface ConciergeMatch {
  id: string;
  score: number;
}
