/**
 * Тип устройства из User-Agent. Четыре значения, без версий и моделей —
 * библиотеки парсинга UA тянут таблицы моделей телефонов, которые нам не нужны.
 *
 * Известное ограничение: iPadOS 13+ по умолчанию представляется как Macintosh,
 * такие заходы попадут в DESKTOP. Лечится только client hints; для наших целей
 * (доля мобильных vs десктоп) погрешность приемлема.
 */
export type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP' | 'UNKNOWN';

/** Планшет проверяем первым: у iPad в UA есть и "ipad", и "mobile". */
const TABLET_RE = /\b(ipad|tablet|playbook|silk)\b|android(?!.*\bmobile\b)/i;
const MOBILE_RE = /\b(iphone|ipod|windows phone|blackberry|bb10|opera mini|iemobile)\b|android.*\bmobile\b/i;

export function parseDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent || !userAgent.trim()) return 'UNKNOWN';
  const ua = userAgent.toLowerCase();
  if (TABLET_RE.test(ua)) return 'TABLET';
  if (MOBILE_RE.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}
