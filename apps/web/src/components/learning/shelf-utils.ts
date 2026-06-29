export interface ArrowState { left: boolean; right: boolean; }

/** Smart-arrow visibility from scroll metrics. 1px tolerance for sub-pixel rounding. */
export function arrowVisibility(scrollLeft: number, scrollWidth: number, clientWidth: number): ArrowState {
  const overflows = scrollWidth > clientWidth + 1;
  if (!overflows) return { left: false, right: false };
  const atStart = scrollLeft <= 1;
  const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
  return { left: !atStart, right: !atEnd };
}
