import { AnalyticsTabs } from '@/components/admin/AnalyticsTabs';

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AnalyticsTabs />
      {children}
    </div>
  );
}
