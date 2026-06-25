'use client';

import { JobManager } from '@/components/admin/JobManager';

export default function JobsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Задачи (решения)</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">
          Состав уроков, публикация и эмбеддинги задач «решения под задачу»
        </p>
      </div>

      <JobManager />
    </div>
  );
}
