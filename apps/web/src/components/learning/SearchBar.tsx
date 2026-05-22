'use client';

import { useState, useEffect } from 'react';

const EXAMPLE_QUERIES = [
  'Как снизить рекламные расходы',
  'Стратегия контента для маркетплейсов',
  'Финансовая модель юнит-экономики',
  'SEO оптимизация карточки товара',
  'Анализ конкурентов и ниш',
];

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
  hasResults: boolean;
}

export function SearchBar({ onSearch, onClear, isSearching, hasResults }: SearchBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    // If user clears input manually (backspace), reset search
    if (val === '') {
      onClear();
    }
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
  };

  const handleChipClick = (query: string) => {
    setInputValue(query);
    onSearch(query);
  };

  return (
    <div>
      <div
        role="search"
        aria-label="Поиск по урокам"
        className="relative flex items-center h-12 border border-mp-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-mp-blue-500 focus-within:ring-offset-2 transition-all"
      >
        {/* Search icon or spinner */}
        <div className="flex items-center justify-center w-12 shrink-0">
          {isSearching ? (
            <svg className="w-4 h-4 text-mp-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>

        {/* Input */}
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isMobile ? 'Опишите задачу...' : 'Опишите задачу — например: как снизить ДРР на Wildberries'}
          className="flex-1 h-full bg-transparent text-body text-mp-gray-900 placeholder:text-mp-gray-400 focus:outline-none"
        />

        {/* Clear button */}
        {inputValue.length > 0 && (
          <button
            onClick={handleClear}
            aria-label="Очистить поиск"
            className="flex items-center justify-center w-10 h-10 shrink-0 text-mp-gray-400 hover:text-mp-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Example queries */}
      {inputValue === '' && !hasResults && (
        <div className="flex flex-wrap gap-2 mt-2">
          {EXAMPLE_QUERIES.map((query) => (
            <button
              key={query}
              onClick={() => handleChipClick(query)}
              className="px-3 py-1 rounded-full bg-mp-gray-100 text-body-sm text-mp-gray-600 hover:bg-mp-gray-200 cursor-pointer transition-colors"
            >
              {query}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
