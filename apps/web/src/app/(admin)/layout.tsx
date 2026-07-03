import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@mpstats/db';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { SalesGate } from '@/components/admin/SalesGate';

const ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  SALES: 'Продажи',
  ADMIN: 'Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check role in UserProfile — ADMIN or SUPERADMIN required
  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'SUPERADMIN' && profile.role !== 'SALES')) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-mp-gray-50">
      {/* SALES role is pinned to the client-registry page (data layer denies the rest) */}
      <SalesGate role={profile.role} />
      {/* Admin Sidebar — fixed on desktop */}
      <AdminSidebar userRole={profile.role} />

      {/* Main content area */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Desktop header (hidden on mobile — AdminSidebar provides mobile header) */}
        <header className="h-16 border-b border-mp-gray-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40 hidden md:block">
          <div className="h-full px-6 flex items-center justify-between">
            <h1 className="text-heading-sm font-semibold text-mp-gray-900">
              Admin Panel
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-body-sm text-mp-gray-500">
                {user.email}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-mp-blue-100 text-mp-blue-700">
                {ROLE_BADGE[profile.role] ?? 'Admin'}
              </span>
              <div className="w-8 h-8 rounded-full bg-mp-blue-100 flex items-center justify-center">
                <span className="text-xs font-medium text-mp-blue-700">
                  {(user.email?.[0] || 'A').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content — top padding on mobile for fixed header bar (h-14) */}
        <main className="flex-1 p-4 md:p-6 pt-[72px] md:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
