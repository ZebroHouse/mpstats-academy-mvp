import { AnalyticsTabs } from '@/components/admin/AnalyticsTabs';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@mpstats/db';

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  // Role decides which tabs show — SALES only sees «Клиенты». The (admin) layout
  // already gates access; this just trims the tab bar.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user
    ? await prisma.userProfile.findUnique({ where: { id: user.id }, select: { role: true } })
    : null;

  return (
    <div className="space-y-6">
      <AnalyticsTabs role={profile?.role} />
      {children}
    </div>
  );
}
