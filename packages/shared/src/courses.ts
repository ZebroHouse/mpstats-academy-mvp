/**
 * Course → marketplace mapping.
 *
 * Course rows carry no marketplace column, so the Ozon courses are listed
 * explicitly. Ozon has two distinct courses that must both be treated as Ozon
 * everywhere (library filter, storefront marketplace, access bundling):
 *   - `05_ozon`               «Работа с Ozon»
 *   - `09_ozon_prodvizhenie`  «Ozon PROдвижение»
 * Every other course is Wildberries. Add new Ozon course ids here — all
 * marketplace-aware consumers derive from this single source of truth.
 */
export const OZON_COURSE_IDS = ['05_ozon', '09_ozon_prodvizhenie'] as const;

export function isOzonCourse(courseId: string): boolean {
  return (OZON_COURSE_IDS as readonly string[]).includes(courseId);
}

export function courseMarketplace(courseId: string): 'WB' | 'OZON' {
  return isOzonCourse(courseId) ? 'OZON' : 'WB';
}
