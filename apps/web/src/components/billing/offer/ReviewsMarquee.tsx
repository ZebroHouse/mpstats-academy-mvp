'use client';

import { REVIEWS } from './reviews';

const TEXT = '#121212';

/**
 * Horizontal auto-scrolling reviews marquee. The track is the review list
 * rendered TWICE so the -50% translate loops seamlessly. Pauses on hover;
 * `prefers-reduced-motion` disables the animation and wraps the cards.
 */
export function ReviewsMarquee() {
  const doubled = [...REVIEWS, ...REVIEWS];
  return (
    <section className="py-[36px] sm:py-[48px] overflow-hidden bg-white">
      <h2 className="text-[20px] sm:text-[26px] font-bold text-center mb-6 px-6" style={{ color: TEXT }}>
        Что говорят ученики Академии
      </h2>
      <style>{`
        @keyframes offer-mscroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .offer-marquee { -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
                         mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
        .offer-mtrack { display: flex; gap: 14px; width: max-content; animation: offer-mscroll 60s linear infinite; }
        .offer-marquee:hover .offer-mtrack { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .offer-mtrack { animation: none; flex-wrap: wrap; width: auto; justify-content: center; }
          .offer-marquee { -webkit-mask-image: none; mask-image: none; }
        }
      `}</style>
      <div className="offer-marquee relative">
        <div className="offer-mtrack">
          {doubled.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="w-[280px] flex-[0_0_auto] rounded-[20px] border border-[#121212]/10 bg-white p-4"
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div
                  className="flex size-[42px] flex-[0_0_42px] items-center justify-center rounded-full text-[14px] font-bold text-white"
                  style={{ backgroundColor: r.color }}
                  aria-hidden="true"
                >
                  {r.initials}
                </div>
                <div>
                  <b className="block text-[14px]" style={{ color: TEXT }}>{r.name}</b>
                  <span className="block text-[12px]" style={{ color: TEXT, opacity: 0.55 }}>{r.role}</span>
                </div>
              </div>
              <p className="text-[13.5px] leading-[1.45]" style={{ color: TEXT, opacity: 0.85 }}>«{r.text}»</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
