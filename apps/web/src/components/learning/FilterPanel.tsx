'use client';

import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command';
import type { SkillCategory } from '@mpstats/shared';

export interface FilterState {
  category: SkillCategory | 'ALL';
  status: string;
  topics: string[];
  difficulty: string;   // 'ALL' | 'EASY' | 'MEDIUM' | 'HARD'
  duration: string;     // 'ALL' | 'short' | 'medium' | 'long'
  courseId: string;      // 'ALL' | course.id
  marketplace: string;  // 'ALL' | 'WB' | 'OZON'
  badge: string;         // 'ALL' | 'START' | 'NEW' | 'HOT' | 'QUICK'
}

export const DEFAULT_FILTERS: FilterState = {
  category: 'ALL',
  status: 'ALL',
  topics: [],
  difficulty: 'ALL',
  duration: 'ALL',
  courseId: 'ALL',
  marketplace: 'ALL',
  badge: 'ALL',
};

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableTopics: string[];
  availableCourses: { id: string; title: string }[];
}

const CATEGORY_OPTIONS: { value: SkillCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'ANALYTICS', label: 'Аналитика' },
  { value: 'MARKETING', label: 'Маркетинг' },
  { value: 'CONTENT', label: 'Контент' },
  { value: 'OPERATIONS', label: 'Операции' },
  { value: 'FINANCE', label: 'Финансы' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'NOT_STARTED', label: 'Не начатые' },
  { value: 'IN_PROGRESS', label: 'В процессе' },
  { value: 'COMPLETED', label: 'Завершённые' },
];

const MARKETPLACE_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'WB', label: 'Wildberries' },
  { value: 'OZON', label: 'Ozon' },
];

function isNonDefault(filters: FilterState): boolean {
  return (
    filters.category !== 'ALL' ||
    filters.status !== 'ALL' ||
    filters.topics.length > 0 ||
    filters.difficulty !== 'ALL' ||
    filters.duration !== 'ALL' ||
    filters.courseId !== 'ALL' ||
    filters.marketplace !== 'ALL' ||
    filters.badge !== 'ALL'
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-caption text-mp-gray-500 font-medium w-24 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-md text-body-sm whitespace-nowrap transition-colors',
        active
          ? 'bg-mp-blue-600 text-white'
          : 'bg-mp-gray-100 text-mp-gray-600 hover:bg-mp-gray-200'
      )}
    >
      {children}
    </button>
  );
}

function SelectFilter({ value, onChange, options, className, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        'px-3 py-1 rounded-md border border-mp-gray-200 text-body-sm bg-white text-mp-gray-700',
        'focus:outline-none focus:border-mp-gray-400',
        'appearance-none cursor-pointer',
        className
      )}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '28px' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FilterPanel({ filters, onFiltersChange, availableTopics, availableCourses }: FilterPanelProps) {
  const update = (partial: Partial<FilterState>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const toggleTopic = (topic: string) => {
    const next = filters.topics.includes(topic)
      ? filters.topics.filter(t => t !== topic)
      : [...filters.topics, topic];
    update({ topics: next });
  };

  return (
    <div className="space-y-3 py-3 px-4 bg-mp-gray-50 rounded-lg border border-mp-gray-100">
      {/* Row 1: Category */}
      <FilterGroup label="Категория">
        {CATEGORY_OPTIONS.map(cat => (
          <Pill key={cat.value} active={filters.category === cat.value} onClick={() => update({ category: cat.value })}>
            {cat.label}
          </Pill>
        ))}
      </FilterGroup>

      {/* Row 2: Status */}
      <FilterGroup label="Статус">
        {STATUS_OPTIONS.map(st => (
          <Pill key={st.value} active={filters.status === st.value} onClick={() => update({ status: st.value })}>
            {st.label}
          </Pill>
        ))}
      </FilterGroup>

      {/* Row 3: Marketplace */}
      <FilterGroup label="Маркетплейс">
        {MARKETPLACE_OPTIONS.map(mp => (
          <Pill key={mp.value} active={filters.marketplace === mp.value} onClick={() => update({ marketplace: mp.value })}>
            {mp.label}
          </Pill>
        ))}
      </FilterGroup>

      {/* Row 4: Dropdowns */}
      <FilterGroup label="Параметры">
        {/* Topics */}
        {availableTopics.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button data-no-ring className={cn(
                'px-3 py-1 rounded-md border text-body-sm whitespace-nowrap transition-colors',
                'focus:outline-none focus:border-mp-gray-400',
                filters.topics.length > 0
                  ? 'border-mp-blue-300 bg-mp-blue-50 text-mp-blue-700'
                  : 'border-mp-gray-200 bg-white text-mp-gray-600 hover:bg-mp-gray-50'
              )}>
                {filters.topics.length > 0
                  ? `Темы: ${filters.topics.length}`
                  : 'Все темы'}
                <svg className="inline-block w-3 h-3 ml-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start" sideOffset={4}>
              <Command>
                <CommandInput placeholder="Найти тему..." />
                <CommandList className="max-h-48">
                  <CommandEmpty>Не найдено</CommandEmpty>
                  {availableTopics.map(topic => (
                    <CommandItem
                      key={topic}
                      value={topic}
                      onSelect={() => toggleTopic(topic)}
                      className="cursor-pointer"
                    >
                      <div className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded border',
                        filters.topics.includes(topic)
                          ? 'border-mp-blue-600 bg-mp-blue-600'
                          : 'border-mp-gray-300'
                      )}>
                        {filters.topics.includes(topic) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-body-sm">{topic}</span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {/* Difficulty */}
        <SelectFilter
          value={filters.difficulty}
          onChange={(v) => update({ difficulty: v })}
          ariaLabel="Фильтр по сложности"
          options={[
            { value: 'ALL', label: 'Сложность' },
            { value: 'EASY', label: 'Лёгкий' },
            { value: 'MEDIUM', label: 'Средний' },
            { value: 'HARD', label: 'Сложный' },
          ]}
        />

        {/* Duration */}
        <SelectFilter
          value={filters.duration}
          onChange={(v) => update({ duration: v })}
          ariaLabel="Фильтр по длительности"
          options={[
            { value: 'ALL', label: 'Длительность' },
            { value: 'short', label: 'До 10 мин' },
            { value: 'medium', label: '10–30 мин' },
            { value: 'long', label: '30+ мин' },
          ]}
        />

        {/* Course */}
        {availableCourses.length > 0 && (
          <SelectFilter
            value={filters.courseId}
            onChange={(v) => update({ courseId: v })}
            ariaLabel="Фильтр по курсу"
            options={[
              { value: 'ALL', label: 'Все курсы' },
              ...availableCourses.map(c => ({ value: c.id, label: c.title })),
            ]}
            className="max-w-[220px]"
          />
        )}

        {/* Tag / badge */}
        <SelectFilter
          value={filters.badge}
          onChange={(v) => update({ badge: v })}
          ariaLabel="Фильтр по тегу"
          options={[
            { value: 'ALL', label: 'Тег' },
            { value: 'START', label: 'Начни отсюда' },
            { value: 'NEW', label: 'Новое' },
            { value: 'HOT', label: 'Хит' },
            { value: 'QUICK', label: '5 мин' },
          ]}
        />
      </FilterGroup>

      {/* Reset */}
      {isNonDefault(filters) && (
        <div className="flex justify-end pt-1">
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-body-sm text-mp-blue-600 hover:underline cursor-pointer"
          >
            Сбросить все фильтры
          </button>
        </div>
      )}
    </div>
  );
}
