'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo, LogoMark } from '@/components/shared/Logo';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { createClient } from '@/lib/supabase/client';
import { getFaqItems } from '@mpstats/ai';
import { toast } from 'sonner';

const THEMES = [
  'Оплата и подписка',
  'Проблема с доступом',
  'Техническая проблема',
  'Предложение',
  'Другое',
] as const;

export default function SupportPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userInfo, setUserInfo] = useState<{ id: string; email: string } | null>(null);

  const FAQ_ITEMS = getFaqItems();

  // Detect authenticated user via Supabase client (works on public page)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setUserInfo({ id: user.id, email: user.email });
      }
    });
  }, []);

  const isAuthenticated = !!userInfo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!theme) {
      toast.error('Выберите тему обращения');
      return;
    }
    if (message.length < 10) {
      toast.error('Сообщение должно содержать не менее 10 символов');
      return;
    }

    const contactEmail = isAuthenticated ? userInfo.email : email;
    if (!contactEmail) {
      toast.error('Укажите email для обратной связи');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          message,
          email: contactEmail,
          userId: userInfo?.id,
        }),
      });

      if (!res.ok) throw new Error('Request failed');

      toast.success('Обращение отправлено! Мы ответим в ближайшее время.');
      setTheme('');
      setMessage('');
      setEmail('');
    } catch {
      toast.error('Не удалось отправить. Попробуйте написать на clients@mpstats.academy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-mp-gray-50 animate-fade-in">
      {/* Header */}
      <header className="bg-white border-b border-mp-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-mp-gray-600 hover:text-mp-gray-900 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-body-sm">Назад</span>
          </button>
          <div className="hidden sm:block">
            <Logo size="sm" />
          </div>
          <div className="sm:hidden">
            <LogoMark size="sm" />
          </div>
          <div className="w-16 shrink-0" />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="text-center">
          <h1 className="text-display-sm text-mp-gray-900 mb-2">Поддержка</h1>
          <p className="text-body text-mp-gray-500">
            Мы всегда готовы помочь. Выберите удобный способ связи.
          </p>
        </div>

        {/* Contact block */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-heading text-mp-gray-900">Свяжитесь с нами</h2>
            <a
              href="mailto:clients@mpstats.academy"
              className="inline-flex items-center gap-3 px-4 py-3 rounded-lg border border-mp-gray-200 hover:border-mp-blue-300 hover:bg-mp-blue-50 transition-colors"
            >
              <svg className="w-5 h-5 text-mp-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-body-sm text-mp-gray-700">clients@mpstats.academy</span>
            </a>
          </CardContent>
        </Card>

        {/* FAQ block */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-heading text-mp-gray-900 mb-4">Частые вопросы</h2>
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-body-sm text-mp-gray-800 text-left">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-body-sm text-mp-gray-600">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Feedback form */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-heading text-mp-gray-900 mb-4">Напишите нам</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Theme select */}
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                  Тема обращения
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full rounded-lg border border-mp-gray-300 bg-white px-3 py-2.5 text-body-sm text-mp-gray-900 focus:border-mp-blue-500 focus:outline-none focus:ring-2 focus:ring-mp-blue-500/20"
                  required
                >
                  <option value="">-- Выберите тему --</option>
                  {THEMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                  Сообщение
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  minLength={10}
                  required
                  placeholder="Опишите вашу проблему или вопрос..."
                  className="w-full rounded-lg border border-mp-gray-300 bg-white px-3 py-2.5 text-body-sm text-mp-gray-900 focus:border-mp-blue-500 focus:outline-none focus:ring-2 focus:ring-mp-blue-500/20 resize-y"
                />
              </div>

              {/* Email — only for unauthenticated users */}
              {!isAuthenticated && (
                <div>
                  <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                    Email для ответа
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-mp-gray-300 bg-white px-3 py-2.5 text-body-sm text-mp-gray-900 focus:border-mp-blue-500 focus:outline-none focus:ring-2 focus:ring-mp-blue-500/20"
                  />
                </div>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? 'Отправка...' : 'Отправить'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
