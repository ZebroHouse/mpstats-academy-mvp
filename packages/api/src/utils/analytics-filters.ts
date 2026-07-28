/**
 * Фрагмент Prisma-where для тумблера «партнёрский трафик» в админ-аналитике.
 * includePartner=false (дефолт) → исключить партнёрские регистрации (курс инструментов
 * MPSTATS): вернуть { isPartnerEntry: false } для спреда рядом с isTest: false.
 * includePartner=true → учитывать всех: пустой фрагмент.
 * Спредить в top-level where (UserProfile-запросы) либо под `user:` (relation-запросы).
 */
export function partnerFilter(includePartner: boolean): { isPartnerEntry: false } | Record<string, never> {
  return includePartner ? {} : { isPartnerEntry: false };
}
