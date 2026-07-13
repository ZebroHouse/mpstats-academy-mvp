import type { MapEntry } from './types';

// ИСТОЧНИК ПРАВДЫ карты платформы. Полное покрытие добавляется в Phase D по аудиту.
// Каждый href ДОЛЖЕН резолвиться в реальный роут (см. platform-map-hrefs.test.ts).
export const PLATFORM_MAP: MapEntry[] = [
  {
    id: 'cancel-subscription',
    kind: 'static',
    section: 'billing',
    showInFaq: true,
    triggers: ['как отменить подписку', 'отписаться', 'убрать автосписание', 'где отключить продление'],
    answer:
      'Открой Профиль → блок «Подписка» → «Отменить». Доступ сохранится до конца оплаченного периода.',
    deepLink: { label: 'Открыть Профиль', href: '/profile' },
  },
  {
    id: 'favorites',
    kind: 'static',
    section: 'navigation',
    triggers: ['где избранное', 'сохранённые уроки', 'как найти что я сохранил'],
    answer:
      'Всё, что ты добавил через сердечко, лежит в разделе Обучение → Избранное.',
    deepLink: { label: 'Открыть Избранное', href: '/learn/favorites' },
  },
  {
    id: 'course-catalog',
    kind: 'dynamic',
    section: 'catalog',
    resolver: 'courseFacts',
    triggers: ['сколько уроков в курсе', 'какие темы в курсе', 'из чего состоит курс', 'что в курсе аналитика'],
  },
];
