'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { AssistantCards } from '@/components/assistant/AssistantCards';
import type { AssistantLessonRef, AssistantJobRef } from '@mpstats/ai';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  lessons?: AssistantLessonRef[];
  jobs?: AssistantJobRef[];
}

export function AssistantConversation() {
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: convo } = trpc.assistant.getConversation.useQuery(undefined, { refetchOnMount: true });
  // Sync persisted history once on load — local state then owns optimistic
  // updates so a background refetch doesn't clobber an in-flight send.
  const historySyncedRef = useRef(false);
  useEffect(() => {
    if (convo?.messages && !historySyncedRef.current) {
      historySyncedRef.current = true;
      setMessages(
        convo.messages.map((m) => ({ role: m.role, content: m.content, lessons: m.lessons, jobs: m.jobs })),
      );
    }
  }, [convo]);

  const { data: quota } = trpc.assistant.getQuota.useQuery();

  const favItems = useMemo(() => {
    const items: { itemType: 'LESSON' | 'JOB'; itemId: string }[] = [];
    for (const m of messages) {
      (m.lessons ?? []).forEach((l) => items.push({ itemType: 'LESSON', itemId: l.lessonId }));
      (m.jobs ?? []).forEach((j) => items.push({ itemType: 'JOB', itemId: j.jobId }));
    }
    return items;
  }, [messages]);
  const { data: favData } = trpc.favorite.isFavorited.useQuery(
    { items: favItems },
    { enabled: favItems.length > 0 },
  );
  const favoritedKeys = useMemo(() => new Set(favData?.favorited ?? []), [favData]);

  const sendMutation = trpc.assistant.sendMessage.useMutation({
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, lessons: res.lessons, jobs: res.jobs }]);
      utils.assistant.getQuota.invalidate();
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Не удалось получить ответ. Попробуй ещё раз.' }]);
    },
  });

  const resetMutation = trpc.assistant.resetConversation.useMutation({
    onSuccess: () => {
      setMessages([]);
      historySyncedRef.current = false;
      utils.assistant.getConversation.invalidate();
    },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sendMutation.isPending]);

  const outOfQuota = quota ? quota.remaining <= 0 : false;

  function send() {
    const msg = input.trim();
    if (!msg || sendMutation.isPending || outOfQuota) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    sendMutation.mutate({ message: msg });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-mp-gray-200 px-4 py-3 pr-12">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-mp-gray-900">AI-ассистент</div>
          <div className="text-xs text-mp-gray-500">Найду уроки и помогу разобраться</div>
        </div>
        <button
          onClick={() => resetMutation.mutate()}
          className="ml-auto text-xs text-mp-gray-500 hover:text-mp-gray-800"
        >
          Новый разговор
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-mp-gray-50 p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-mp-gray-500">
            Спроси про уроки платформы или про твой бизнес на маркетплейсе — например «из чего складывается ДРР?»
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-mp-blue-600 px-3 py-2 text-sm text-white'
                  : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-mp-gray-200 bg-white px-3 py-2 text-sm text-mp-gray-800'
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && (
                <AssistantCards lessons={m.lessons ?? []} jobs={m.jobs ?? []} favoritedKeys={favoritedKeys} />
              )}
            </div>
          </div>
        ))}
        {sendMutation.isPending && <div className="text-xs text-mp-gray-400">Ассистент печатает…</div>}
      </div>

      <div className="border-t border-mp-gray-200 p-3">
        {quota &&
          quota.tier === 'free' &&
          (outOfQuota ? (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Бесплатные вопросы на сегодня закончились. На подписке помощник без ограничений —{' '}
              <a href="/billing" className="font-semibold underline">
                оформить
              </a>
              .
            </div>
          ) : (
            <div className="mb-2 text-center text-xs text-mp-gray-400">
              Осталось {quota.remaining} из {quota.limit} бесплатных вопросов сегодня
            </div>
          ))}
        <div className="flex items-center gap-2 rounded-xl border border-mp-gray-200 bg-mp-gray-50 py-1 pl-3 pr-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            disabled={outOfQuota}
            placeholder="Спроси про уроки или маркетплейсы…"
            className="flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={sendMutation.isPending || outOfQuota || !input.trim()}
            aria-label="Отправить"
            className="grid h-8 w-8 place-items-center rounded-lg bg-mp-blue-600 text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-mp-gray-400">
          Отвечает по материалам академии. Не финансовый совет.
        </p>
      </div>
    </div>
  );
}
