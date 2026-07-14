'use client';

import { useEffect, useState } from 'react';

// Клиентские «стадии работы» — псевдо-прогресс, чтобы ожидание не ощущалось зависшим.
// Бэкенд отвечает одной mutation без событий прогресса, поэтому стадии сменяются по
// таймеру, примерно повторяя реальный пайплайн (разбор вопроса → поиск → синтез).
// Последняя стадия — мягкая ремарка про долгий первый ответ, дальше не зацикливаемся
// (анимированные точки продолжают показывать, что процесс жив).
const STAGES: { at: number; label: string }[] = [
  { at: 0, label: 'Изучаю вопрос' },
  { at: 1500, label: 'Ищу материалы и уроки' },
  { at: 4000, label: 'Формулирую ответ' },
  { at: 9000, label: 'Собираю всё вместе' },
  { at: 18000, label: 'Первый ответ бывает дольше — ещё секунду' },
];

export function AssistantThinking() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGES.slice(1).map((s, i) => setTimeout(() => setStage(i + 1), s.at));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-mp-gray-400" aria-live="polite">
      <span>{STAGES[stage].label}</span>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full bg-mp-gray-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </div>
  );
}
