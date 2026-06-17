import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * DarkIsland — v2 reskin primitive. A dark (#0F172A) rounded hero/CTA block that
 * brings marketing-grade depth into the otherwise-light product. Keep ≤1 per
 * screen (design-system guard-rail). Text is white; pair a blue pill CTA.
 */
interface DarkIslandProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Convenience single pill CTA. Ignored if `actions` is provided. */
  cta?: { label: string; href: string };
  /** Custom action node(s) under the subtitle (overrides `cta`). */
  actions?: React.ReactNode;
  /** Right-side content (stats, progress). */
  aside?: React.ReactNode;
  className?: string;
}

export function DarkIsland({ eyebrow, title, subtitle, cta, actions, aside, className }: DarkIslandProps) {
  return (
    <section
      className={cn('rounded-3xl p-6 sm:p-10 text-white', className)}
      style={{ backgroundColor: '#0F172A' }}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[12px] uppercase tracking-wider text-white/40 mb-2">{eyebrow}</div>
          )}
          <h1 className="text-[26px] sm:text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-white/60 text-[15px] sm:text-[16px] mt-2 max-w-[640px] leading-relaxed">
              {subtitle}
            </p>
          )}
          {actions ? (
            <div className="flex flex-wrap items-center gap-3 mt-5">{actions}</div>
          ) : (
            cta && (
              <Link
                href={cta.href}
                className="inline-flex items-center justify-center rounded-full h-12 px-8 mt-5 text-[15px] font-medium text-white bg-mp-blue-500 hover:bg-mp-blue-600 transition-colors"
              >
                {cta.label}
              </Link>
            )
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </section>
  );
}

/** Stat cell for a DarkIsland aside (white-on-dark). */
export function DarkIslandStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="text-[28px] sm:text-[32px] font-bold leading-none">{value}</div>
      <div className="text-white/50 text-[13px] mt-1">{label}</div>
    </div>
  );
}
