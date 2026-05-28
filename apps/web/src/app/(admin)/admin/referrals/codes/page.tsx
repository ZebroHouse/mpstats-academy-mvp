import { AmbassadorCodesTable } from '@/components/admin/AmbassadorCodesTable';

export const dynamic = 'force-dynamic';

export default function AmbassadorCodesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">
          Амбассадорские коды
        </h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">
          Управление кодами для внешних блогеров. Custom-trial для приведённых юзеров.
        </p>
      </div>
      <AmbassadorCodesTable />
    </div>
  );
}
