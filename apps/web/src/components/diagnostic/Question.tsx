'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DiagnosticQuestion } from '@mpstats/shared';

interface QuestionProps {
  question: DiagnosticQuestion;
  onAnswer: (selectedIndex: number) => void;
  isSubmitting?: boolean;
  feedback?: {
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
  } | null;
  // Phase 59 D-09 — mix-users see a marketplace badge on non-BOTH questions.
  // Undefined or single-element arrays render no badge.
  userMarketplaces?: string[];
}

// Russian labels for the per-question marketplace badge (D-09).
const MP_LABEL: Record<string, string> = {
  WB: 'Про Wildberries',
  OZON: 'Про Ozon',
};

const CATEGORY_COLORS: Record<string, string> = {
  ANALYTICS: 'bg-blue-100 text-blue-700',
  MARKETING: 'bg-green-100 text-green-700',
  CONTENT: 'bg-purple-100 text-purple-700',
  OPERATIONS: 'bg-orange-100 text-orange-700',
  FINANCE: 'bg-yellow-100 text-yellow-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  ANALYTICS: 'Аналитика',
  MARKETING: 'Маркетинг',
  CONTENT: 'Контент',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: 'Базовый',
  MEDIUM: 'Средний',
  HARD: 'Продвинутый',
};

export function Question({ question, onAnswer, isSubmitting, feedback, userMarketplaces }: QuestionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleSelect = (index: number) => {
    if (feedback || isSubmitting) return; // Can't change after submission
    setSelectedIndex(index);
  };

  const handleSubmit = () => {
    if (selectedIndex === null) return;
    onAnswer(selectedIndex);
  };

  const getOptionStyle = (index: number) => {
    if (feedback) {
      if (index === feedback.correctIndex) {
        return 'border-green-500 bg-green-50 ring-2 ring-green-500';
      }
      if (index === selectedIndex && !feedback.isCorrect) {
        return 'border-red-500 bg-red-50 ring-2 ring-red-500';
      }
      return 'border-gray-200 opacity-50';
    }

    if (index === selectedIndex) {
      return 'border-blue-500 bg-blue-50 ring-2 ring-blue-500';
    }

    return 'border-gray-200 hover:border-blue-300 hover:bg-gray-50';
  };

  return (
    <div className="space-y-6">
      {/* Category & Difficulty */}
      <div className="flex items-center gap-2">
        <span className={cn('px-3 py-1 rounded-full text-sm font-medium', CATEGORY_COLORS[question.skillCategory])}>
          {CATEGORY_LABELS[question.skillCategory]}
        </span>
        <span className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-600">
          {DIFFICULTY_LABELS[question.difficulty]}
        </span>
        {/* Phase 59 D-09 — marketplace badge for mix-users on non-BOTH questions */}
        {userMarketplaces &&
          userMarketplaces.length === 2 &&
          question.marketplace &&
          question.marketplace !== 'BOTH' &&
          MP_LABEL[question.marketplace] && (
            <Badge variant="outline-default" className="text-xs">
              {MP_LABEL[question.marketplace]}
            </Badge>
          )}
      </div>

      {/* Question */}
      <h2 className="text-xl font-semibold text-gray-900">
        {question.question}
      </h2>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleSelect(index)}
            disabled={!!feedback || isSubmitting}
            className={cn(
              'w-full p-4 text-left border-2 rounded-lg transition-all',
              getOptionStyle(index),
              (feedback || isSubmitting) ? 'cursor-default' : 'cursor-pointer'
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm',
                feedback && index === feedback.correctIndex
                  ? 'bg-green-500 text-white'
                  : feedback && index === selectedIndex && !feedback.isCorrect
                  ? 'bg-red-500 text-white'
                  : selectedIndex === index
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              )}>
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1 pt-1">{option}</span>
              {feedback && index === feedback.correctIndex && (
                <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {feedback && index === selectedIndex && !feedback.isCorrect && (
                <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <Card className={cn(
          'border-l-4',
          feedback.isCorrect ? 'border-l-green-500 bg-green-50' : 'border-l-red-500 bg-red-50'
        )}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              {feedback.isCorrect ? (
                <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div>
                <p className={cn(
                  'font-medium',
                  feedback.isCorrect ? 'text-green-800' : 'text-red-800'
                )}>
                  {feedback.isCorrect ? 'Правильно!' : 'Неправильно'}
                </p>
                <p className="text-gray-700 mt-1">{feedback.explanation}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit button */}
      {!feedback && (
        <Button
          onClick={handleSubmit}
          disabled={selectedIndex === null || isSubmitting}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Проверка...
            </>
          ) : (
            'Ответить'
          )}
        </Button>
      )}
    </div>
  );
}
