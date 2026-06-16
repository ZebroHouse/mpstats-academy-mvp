import { BookOpen, Clock, Target, Bot, type LucideIcon } from 'lucide-react';

/* ── Shared content (single source of truth) ─────────────── */

const HEADLINE = 'Обучение маркетплейсам, собранное под вас';
const SUBHEAD =
  'AI-диагностика за 10 минут определяет ваш уровень и собирает персональную программу — без воды и одинакового потока для всех.';
const PRICE_OLD = 'Офлайн-курсы: 45 000–90 000 ₽ единоразово';
const PRICE_NEW = '2 990 ₽ / мес — полный доступ';

const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'] as const;

type Stat = { icon: LucideIcon; value: string; label: string };
const STATS: Stat[] = [
  { icon: BookOpen, value: '400+', label: 'уроков' },
  { icon: Clock, value: '150+', label: 'часов контента' },
  { icon: Target, value: '10 мин', label: 'до персонального плана' },
  { icon: Bot, value: 'AI', label: 'ассистент в каждом уроке' },
];

const PANEL_BG =
  'bg-gradient-to-br from-mp-blue-500 to-mp-blue-700 text-white';

/* ── Shared pieces ───────────────────────────────────────── */

function AxesChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {AXES.map((axis) => (
        <span
          key={axis}
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90"
        >
          {axis}
        </span>
      ))}
    </div>
  );
}

function StatGrid({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const iconCls = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  const valueCls = size === 'lg' ? 'text-xl' : 'text-lg';
  return (
    <div className="grid grid-cols-2 gap-3">
      {STATS.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-4"
        >
          <Icon className={`${iconCls} shrink-0 text-mp-green-400`} aria-hidden />
          <div>
            <div className={`${valueCls} font-bold leading-none text-mp-green-400`}>
              {value}
            </div>
            <div className="mt-1 text-xs leading-tight text-white/75">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceCompare() {
  return (
    <div className="rounded-xl bg-white/10 p-4 text-sm">
      <div className="text-white/60 line-through">{PRICE_OLD}</div>
      <div className="mt-1 text-base font-bold text-mp-green-400">{PRICE_NEW}</div>
    </div>
  );
}

function RadarBg() {
  return (
    <svg
      className="pointer-events-none absolute -right-12 -top-10 h-64 w-64 opacity-10"
      viewBox="0 0 200 200"
      aria-hidden
    >
      <polygon
        points="100,20 169,60 169,140 100,180 31,140 31,60"
        fill="none"
        stroke="white"
        strokeWidth="1"
      />
      <polygon
        points="100,55 134,75 134,125 100,145 66,125 66,75"
        fill="none"
        stroke="white"
        strokeWidth="1"
      />
      {[
        [100, 20], [169, 60], [169, 140], [100, 180], [31, 140], [31, 60],
      ].map(([x, y]) => (
        <line key={`${x}-${y}`} x1="100" y1="100" x2={x} y2={y} stroke="white" strokeWidth="1" />
      ))}
    </svg>
  );
}

/* ── Public exports ──────────────────────────────────────── */

/** Compact value teaser — used at the top of the mobile stack. */
export function RegisterValueTeaser({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl ${PANEL_BG} p-6 ${className}`}>
      <h2 className="text-xl font-bold leading-tight">{HEADLINE}</h2>
      <p className="mt-2 text-sm leading-snug text-white/80">{SUBHEAD}</p>
      <div className="mt-4">
        <AxesChips />
      </div>
    </div>
  );
}

/** Stats + price block — used below the form on the mobile stack. */
export function RegisterValueStats({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl ${PANEL_BG} p-6 ${className}`}>
      <StatGrid />
      <PriceCompare />
    </div>
  );
}

/** Full-height value panel — the desktop right column. */
export function RegisterValuePanel({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${PANEL_BG} p-10 ${className}`}>
      <RadarBg />
      <div className="relative flex h-full flex-col gap-6">
        <div>
          <h2 className="max-w-md text-2xl font-bold leading-tight">{HEADLINE}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{SUBHEAD}</p>
        </div>
        <AxesChips />
        <StatGrid size="lg" />
        <div className="mt-auto">
          <PriceCompare />
        </div>
      </div>
    </div>
  );
}
