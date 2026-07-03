'use client';

import { Layers, PlaySquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Inline explainer on the results screen (spec §6.3). Owner decision: inline block, not tooltip. */
export function HowLearningWorks() {
  return (
    <Card className="shadow-mp-card border-mp-gray-200">
      <CardContent className="py-5">
        <h2 className="text-heading font-semibold text-mp-gray-900 mb-3">Как устроено обучение</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[#eef0ff] text-[#4338ca] shrink-0"><Layers className="w-5 h-5" /></div>
            <div>
              <div className="text-body font-semibold text-mp-gray-900">Задача</div>
              <p className="text-body-sm text-mp-gray-500 mt-0.5">Готовый маршрут из уроков под конкретную цель.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-mp-gray-50 text-mp-gray-500 shrink-0"><PlaySquare className="w-5 h-5" /></div>
            <div>
              <div className="text-body font-semibold text-mp-gray-900">Урок</div>
              <p className="text-body-sm text-mp-gray-500 mt-0.5">Один материал: видео или текст.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
