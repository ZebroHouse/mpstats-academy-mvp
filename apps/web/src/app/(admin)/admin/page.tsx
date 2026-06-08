'use client';

import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ClipboardCheck, BookOpen, UserPlus, UserRoundPlus, GraduationCap, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-48 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const stats = trpc.admin.getDashboardStats.useQuery();
  const activity = trpc.admin.getRecentActivity.useQuery();
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ days: 7 });
  const commentStats = trpc.admin.getComments.useQuery(
    { status: 'all', period: 'all' },
    { select: (data) => ({ total: data?.totalCount ?? 0, newCount: data?.newCount ?? 0 }) }
  );

  if (stats.isLoading || activity.isLoading) {
    return <DashboardSkeleton />;
  }

  if (stats.error) {
    return (
      <div className="animate-fade-in p-6">
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load dashboard stats</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{stats.error.message}</p>
        </Card>
      </div>
    );
  }

  const data = stats.data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Dashboard</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Platform overview and recent activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Users"
          value={data?.totalUsers ?? 0}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Completed Diagnostics"
          value={data?.totalDiagnostics ?? 0}
          icon={ClipboardCheck}
          color="green"
        />
        <StatCard
          title="Total Lessons"
          value={data?.totalLessons ?? 0}
          icon={BookOpen}
          color="pink"
        />
        <StatCard
          title="New Users (7d)"
          value={data?.recentRegistrations ?? 0}
          icon={UserPlus}
          color="gray"
          trend={data && data.totalUsers > 0
            ? `${((data.recentRegistrations / data.totalUsers) * 100).toFixed(0)}% of total`
            : undefined}
        />
        <Link href="/admin/comments">
          <StatCard
            title="Comments"
            value={commentStats.data?.total ?? 0}
            icon={MessageSquare}
            color="pink"
            trend={commentStats.data?.newCount
              ? `+${commentStats.data.newCount} today`
              : undefined}
          />
        </Link>
      </div>

      {/* Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mini registration chart */}
        <Card className="p-5">
          <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">
            Registrations (last 7 days)
          </h3>
          {analytics.data?.userGrowth ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics.data.userGrowth}>
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  fill="url(#blueGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-mp-gray-400">
              No chart data
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="p-5">
          <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">
            Recent Activity
          </h3>
          {activity.data && activity.data.length > 0 ? (
            <div className="space-y-3">
              {activity.data.map((event, i) => (
                <div
                  key={`${event.type}-${i}`}
                  className="flex items-center gap-3 py-2 border-b border-mp-gray-100 last:border-0"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    event.type === 'registration'
                      ? 'bg-mp-blue-50'
                      : 'bg-mp-green-50'
                  }`}>
                    {event.type === 'registration' ? (
                      <UserRoundPlus className="w-4 h-4 text-mp-blue-500" />
                    ) : (
                      <GraduationCap className="w-4 h-4 text-mp-green-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-mp-gray-900 truncate">
                      {event.type === 'registration'
                        ? `${event.userName} registered`
                        : `${event.userName} completed diagnostic`}
                    </p>
                  </div>
                  <span className="text-xs text-mp-gray-400 shrink-0">
                    {formatTimeAgo(event.date)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body-sm text-mp-gray-400 py-8 text-center">
              No recent activity
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
