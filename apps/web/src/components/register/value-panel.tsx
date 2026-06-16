import { Target, BookOpen, Bot, Layers, type LucideIcon } from 'lucide-react';

/* ── Shared content (single source of truth) ─────────────── */

const HEADLINE = 'Обучение маркетплейсам, собранное под вас';
const SUBHEAD = 'Персональная программа вместо одинакового потока для всех.';

const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'] as const;

type Thesis = {
  icon: LucideIcon;
  iconClass: string; // translucent tile bg + icon color
  title: string;
  desc?: string;
  axes?: boolean; // render the axis chips instead of a description
};

const THESES: Thesis[] = [
  {
    icon: Target,
    iconClass: 'bg-[#2C4FF8]/20 text-[#9DB2FF]',
    title: 'AI-диагностика за 10 минут',
    desc: 'собирает ваш персональный план обучения',
  },
  {
    icon: BookOpen,
    iconClass: 'bg-[#87F50F]/20 text-[#87F50F]',
    title: '400+ уроков · 150+ часов',
    desc: 'видео-практика по маркетплейсам',
  },
  {
    icon: Bot,
    iconClass: 'bg-[#ff6b16]/20 text-[#ff6b16]',
    title: 'AI-ассистент в каждом уроке',
    desc: 'ответ и точная минута в видео',
  },
  {
    icon: Layers,
    iconClass: 'bg-[#EC4899]/20 text-[#F472B6]',
    title: '5 направлений',
    axes: true,
  },
];

/* ── Shared pieces ───────────────────────────────────────── */

function AxesChips() {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {AXES.map((axis) => (
        <span
          key={axis}
          className="rounded-full bg-white/[0.12] px-2.5 py-[3px] text-[11px] text-white/85"
        >
          {axis}
        </span>
      ))}
    </div>
  );
}

function ThesisList() {
  return (
    <div className="flex flex-col gap-2.5">
      {THESES.map(({ icon: Icon, iconClass, title, desc, axes }) => (
        <div
          key={title}
          className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-snug text-white">{title}</div>
            {axes ? (
              <AxesChips />
            ) : (
              <div className="mt-0.5 text-[13px] leading-tight text-white/55">{desc}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceStrip() {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[#2C4FF8]/45 bg-gradient-to-r from-[#2C4FF8]/20 to-[#2C4FF8]/[0.06] p-4 sm:p-5">
      <div>
        <span className="text-[12.5px] text-white/55 line-through">
          Офлайн-курсы 45 000–90 000 ₽
        </span>
        <div className="text-[11px] text-white/55">единоразово</div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-white">
          2 990 ₽ <span className="text-[13px] font-medium text-white/70">/ мес</span>
        </div>
        <div className="text-[11px] text-[#87F50F]">полный доступ</div>
      </div>
    </div>
  );
}

/* ── Public exports ──────────────────────────────────────── */

/**
 * Promo headline + subhead. Sits directly on the dark register canvas
 * (top-right on desktop, top of the stack on mobile). Text only — no card.
 */
export function RegisterValueTeaser({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <h2 className="max-w-[620px] text-3xl font-bold leading-[1.1] tracking-tight sm:text-[40px]">
        {HEADLINE}
      </h2>
      <p className="mt-3 max-w-[460px] text-sm leading-relaxed text-white/60 sm:mt-4 sm:text-base">
        {SUBHEAD}
      </p>
    </div>
  );
}

/**
 * Thesis plaques + price strip. Fills the lower-right cell on desktop
 * (price pinned to the bottom via justify-between) and sits below the form
 * on mobile.
 */
export function RegisterValueStats({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-full flex-col justify-between gap-5 ${className}`}>
      <ThesisList />
      <PriceStrip />
    </div>
  );
}
