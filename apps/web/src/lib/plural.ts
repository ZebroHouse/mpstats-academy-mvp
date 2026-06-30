/**
 * Russian noun pluralization (one/few/many forms).
 *
 * Picks the correct grammatical form for a count: 1 → one, 2-4 → few, 0/5-20 →
 * many, then by the last digit (21 → one, 22-24 → few…), with the 11-14
 * exception which is always "many".
 *
 * @param n     the count
 * @param forms [one, few, many] — e.g. ['день', 'дня', 'дней']
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;

  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «день» / «дня» / «дней» for a number of days. */
export function pluralizeDays(n: number): string {
  return pluralRu(n, ['день', 'дня', 'дней']);
}
