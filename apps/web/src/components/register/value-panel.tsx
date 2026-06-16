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
    desc: 'собирает персональный план',
  },
  {
    icon: BookOpen,
    iconClass: 'bg-[#87F50F]/20 text-[#87F50F]',
    title: '400+ уроков · 150+ часов',
    desc: 'видео-практика',
  },
  {
    icon: Bot,
    iconClass: 'bg-[#ff6b16]/20 text-[#ff6b16]',
    title: 'AI-ассистент в уроке',
    desc: 'ответ и точная минута в видео',
  },
  {
    icon: Layers,
    iconClass: 'bg-[#EC4899]/20 text-[#F472B6]',
    title: '5 направлений',
    axes: true,
  },
];

const DARK = 'bg-[#0F172A] text-white';

/* ── Shared pieces ───────────────────────────────────────── */

function AxesChips() {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {AXES.map((axis) => (
        <span
          key={axis}
          className="rounded-full bg-white/[0.12] px-2 py-[3px] text-[10px] text-white/85"
        >
          {axis}
        </span>
      ))}
    </div>
  );
}

function ThesisGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {THESES.map(({ icon: Icon, iconClass, title, desc, axes }) => (
        <div
          key={title}
          className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"
        >
          <div
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${iconClass}`}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </div>
          <div className="mt-2.5 text-sm font-bold leading-snug">{title}</div>
          {axes ? (
            <AxesChips />
          ) : (
            <div className="mt-0.5 text-[11.5px] leading-tight text-white/60">{desc}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function PriceStrip() {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[#2C4FF8]/40 bg-gradient-to-r from-[#2C4FF8]/20 to-[#2C4FF8]/[0.06] p-4">
      <div>
        <span className="text-[11px] text-white/55 line-through">
          Офлайн 45 000–90 000 ₽
        </span>
        <div className="text-[10px] text-white/55">единоразово</div>
      </div>
      <div className="text-right">
        <div className="text-xl font-bold">
          2 990 ₽ <span className="text-xs font-medium text-white/70">/ мес</span>
        </div>
        <div className="text-[10px] text-[#87F50F]">полный доступ</div>
      </div>
    </div>
  );
}

/* ── Public exports ──────────────────────────────────────── */

/** Compact value teaser — top of the mobile stack. */
export function RegisterValueTeaser({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-3xl ${DARK} p-6 ${className}`}>
      <h2 className="text-xl font-bold leading-tight tracking-tight">{HEADLINE}</h2>
      <p className="mt-2 text-[13px] leading-snug text-white/60">{SUBHEAD}</p>
    </div>
  );
}

/** Thesis cards + price — below the form on the mobile stack. */
export function RegisterValueStats({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 rounded-3xl ${DARK} p-6 ${className}`}>
      <ThesisGrid />
      <PriceStrip />
    </div>
  );
}

/** Full-height value panel — the desktop right column. */
export function RegisterValuePanel({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-full flex-col rounded-3xl ${DARK} p-8 lg:p-9 ${className}`}>
      <h2 className="max-w-[340px] text-2xl font-bold leading-tight tracking-tight">
        {HEADLINE}
      </h2>
      <p className="mt-2 max-w-[340px] text-sm leading-snug text-white/60">{SUBHEAD}</p>
      <div className="mt-5">
        <ThesisGrid />
      </div>
      <div className="mt-3">
        <PriceStrip />
      </div>
    </div>
  );
}
