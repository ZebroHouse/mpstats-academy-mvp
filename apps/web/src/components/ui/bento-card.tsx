import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * BentoCard — v2 reskin primitive. A colored-fill entry card (ported from the
 * marketing bento language) for top-level navigation entry points. Large radius,
 * lift on hover, no colored icon tiles — icon sits plain on the fill.
 */
type Tone = 'blue' | 'dark' | 'gray' | 'orange';

const TONES: Record<Tone, { style: React.CSSProperties; text: string; sub: string }> = {
  blue: { style: { backgroundColor: '#2C4FF8' }, text: 'text-white', sub: 'text-white/70' },
  dark: { style: { backgroundColor: '#0F172A' }, text: 'text-white', sub: 'text-white/60' },
  orange: { style: { backgroundColor: '#ff6b16' }, text: 'text-white', sub: 'text-white/80' },
  gray: { style: { backgroundColor: '#f4f4f4' }, text: 'text-[#121212]', sub: 'text-[#121212]/60' },
};

interface BentoCardProps {
  href: string;
  tone: Tone;
  icon: LucideIcon;
  title: string;
  sub: string;
  dataTour?: string;
}

export function BentoCard({ href, tone, icon: Icon, title, sub, dataTour }: BentoCardProps) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className="flex flex-col justify-between rounded-3xl p-7 min-h-[160px] h-full transition-transform duration-300 hover:-translate-y-1"
      style={t.style}
    >
      <Icon className={cn('w-7 h-7', t.text)} />
      <div>
        <div className={cn('text-[20px] font-bold leading-tight', t.text)}>{title}</div>
        <div className={cn('text-[14px] mt-1 leading-relaxed', t.sub)}>{sub}</div>
      </div>
    </Link>
  );
}
