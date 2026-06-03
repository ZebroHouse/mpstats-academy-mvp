'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LearningTabs } from '@/components/learning/LearningTabs';

/**
 * «Избранное» page.
 *
 * Wave 3 (61-02) ships only the empty-state placeholder so the nav route resolves.
 * Real `favorite.list` wiring (heart toggle + saved items) lands in Wave D / 61-07.
 */
export default function FavoritesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      <div className="animate-slide-up">
        <h1 className="text-display-sm text-mp-gray-900">Избранное</h1>
        <p className="text-body text-mp-gray-500 mt-1">
          Сохранённые уроки, решения и материалы
        </p>
      </div>

      <Card className="shadow-mp-card border-mp-gray-200">
        <CardContent className="py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-mp-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h2 className="text-heading-lg text-mp-gray-900 mb-2">В избранном пусто</h2>
          <p className="text-body text-mp-gray-600 mb-6 max-w-md mx-auto">
            Нажимайте на сердечко у уроков, решений и материалов — они появятся здесь.
          </p>
          <Link href="/learn/library">
            <Button variant="outline" size="lg">Перейти в Базу знаний</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
