'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer, type PlayerHandle } from '@/components/video/KinescopePlayer';
import { TimecodeLink } from '@/components/video/TimecodeLink';
import { trpc } from '@/lib/trpc/client';
import { SafeMarkdown } from '@/components/shared/SafeMarkdown';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    timecodeFormatted: string;
    content: string;
    timecode_start: number;
    timecode_end: number;
  }>;
}

/**
 * Shared chat card body — message list + input. Reuses the exact same chat
 * UI/logic as the standard lesson player (`learn/[id]/page.tsx`), just extracted
 * so desktop + mobile can share it without duplicating markup.
 */
function ChatCard({
  hasVideo,
  chatMessages,
  chatMutation,
  chatInput,
  setChatInput,
  handleSendMessage,
  handleKeyPress,
  chatContainerRef,
  handleTimecodeClick,
  className,
}: {
  hasVideo: boolean;
  chatMessages: ChatMessage[];
  chatMutation: { isPending: boolean };
  chatInput: string;
  setChatInput: (v: string) => void;
  handleSendMessage: () => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  handleTimecodeClick: (seconds: number) => void;
  className?: string;
}) {
  return (
    <Card className={cn('h-[400px] flex flex-col shadow-mp-card', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-heading flex items-center gap-2">
          <svg className="w-5 h-5 text-mp-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Задайте вопрос по уроку
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-3 mb-3">
          {chatMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-mp-gray-400 text-body-sm text-center p-4">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-body-sm">Спросите что угодно по материалу урока</p>
                <p className="text-xs text-mp-gray-400 mt-1">AI найдёт ответ в уроке</p>
              </div>
            </div>
          ) : (
            chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-lg p-3 text-body-sm',
                  msg.role === 'user' ? 'bg-mp-blue-50 text-mp-blue-900 ml-4' : 'bg-mp-gray-100 text-mp-gray-800 mr-4'
                )}
              >
                <SafeMarkdown
                  content={msg.content}
                  className="prose prose-sm max-w-none"
                  sources={msg.sources}
                  onSourceSeek={handleTimecodeClick}
                  disableSourceLinks={!hasVideo}
                />
                {msg.sources && msg.sources.length > 0 && (
                  <div className="border-t border-mp-gray-200 mt-2 pt-2">
                    <p className="text-xs text-mp-gray-500">Источники:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {msg.sources.map((src, i) => (
                        <span key={src.id} className="inline-flex items-center gap-1 text-xs">
                          <span className="text-mp-blue-600 font-medium">[{i + 1}]</span>
                          <TimecodeLink
                            startSeconds={src.timecode_start}
                            formattedTime={src.timecodeFormatted}
                            onSeek={handleTimecodeClick}
                            disabled={!hasVideo}
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading indicator */}
          {chatMutation.isPending && (
            <div className="bg-mp-gray-100 rounded-lg p-3 mr-4">
              <div className="flex items-center gap-2 text-body-sm text-mp-gray-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI думает...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="pt-2 border-t border-mp-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Задайте вопрос по уроку..."
              disabled={chatMutation.isPending}
              className="flex-1 px-3 py-2 border border-mp-gray-300 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-mp-blue-500 focus:border-transparent disabled:bg-mp-gray-50 disabled:text-mp-gray-400"
            />
            <Button onClick={handleSendMessage} disabled={!chatInput.trim() || chatMutation.isPending} size="sm">
              {chatMutation.isPending ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-caption text-mp-gray-400 leading-snug">
            AI отвечает на основе материала этого урока.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PartnerLessonView({ lessonId }: { lessonId: string }) {
  const router = useRouter();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle>(null);

  // Watch progress: position tracking refs (no re-renders) — mirrors learn/[id]/page.tsx
  const lastPositionRef = useRef<number>(0);
  const lastDurationRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: lesson, isLoading, error } = trpc.partner.getLesson.useQuery({ lessonId });
  const { data: watchProgress } = trpc.learning.getWatchProgress.useQuery({ lessonId });

  const handleTimecodeClick = (seconds: number) => {
    playerRef.current?.seekTo(seconds);
    document.getElementById('video-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Save watch progress mutation. saveWatchProgress auto-creates the LearningPath,
  // so this works for partner lessons even with no diagnostic / track.
  const saveWatchProgress = trpc.learning.saveWatchProgress.useMutation({
    onError: (err) => {
      console.warn('Failed to save watch progress:', err.message);
    },
  });

  // Stable ref for mutation to avoid re-render loops (useMutation returns unstable refs).
  const saveWatchProgressRef = useRef(saveWatchProgress);
  saveWatchProgressRef.current = saveWatchProgress;

  // Throttled save handler (every 15 seconds) — stores in refs, no re-renders.
  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      lastPositionRef.current = currentTime;
      lastDurationRef.current = duration;

      if (saveTimeoutRef.current) return;

      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        if (lastPositionRef.current >= 5) {
          saveWatchProgressRef.current.mutate({
            lessonId,
            position: lastPositionRef.current,
            duration: lastDurationRef.current,
          });
        }
      }, 15_000);
    },
    [lessonId]
  );

  // Save on tab hide / page unload (final position capture) — mirrors reference page.
  useEffect(() => {
    const flushBeacon = () => {
      if (lastPositionRef.current < 5 || lastDurationRef.current <= 0) return;
      const payload = JSON.stringify({
        lessonId,
        position: lastPositionRef.current,
        duration: lastDurationRef.current,
      });
      try {
        const sent = navigator.sendBeacon?.(
          '/api/trpc/learning.saveWatchProgress',
          new Blob([JSON.stringify({ json: payload })], { type: 'application/json' })
        );
        if (sent) return;
      } catch {
        /* fall through to mutation */
      }
      saveWatchProgressRef.current.mutate({
        lessonId,
        position: lastPositionRef.current,
        duration: lastDurationRef.current,
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushBeacon();
    };

    window.addEventListener('beforeunload', flushBeacon);
    window.addEventListener('pagehide', flushBeacon);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushBeacon);
      window.removeEventListener('pagehide', flushBeacon);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (lastPositionRef.current >= 5 && lastDurationRef.current > 0) {
        saveWatchProgressRef.current.mutate({
          lessonId,
          position: lastPositionRef.current,
          duration: lastDurationRef.current,
        });
      }
    };
  }, [lessonId]);

  // Chat mutation — same IO as learn/[id]/page.tsx
  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (result) => {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: result.content, sources: result.sources }]);
    },
  });

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = () => {
    if (!chatInput.trim() || chatMutation.isPending) return;

    const userMessage = chatInput.trim();
    setChatInput('');

    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    chatMutation.mutate({
      lessonId,
      message: userMessage,
      history: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-mp-gray-200 rounded-lg w-64 animate-pulse" />
        <div className="aspect-video bg-mp-gray-200 rounded-xl animate-pulse" />
        <div className="h-48 bg-mp-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  // NOT_FOUND (or any error) → friendly fallback with a link back to the catalog.
  if (error || !lesson) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-mp-card">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-body text-mp-gray-500">Урок не найден</p>
            <Button className="mt-4" onClick={() => router.push('/mpstats-tools')}>
              К инструментам MPSTATS
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasVideo = !!lesson.videoId;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-body-sm min-w-0 overflow-hidden">
        <Link href="/mpstats-tools" className="text-mp-gray-500 hover:text-mp-blue-600 transition-colors shrink-0">
          Инструменты MPSTATS
        </Link>
        <span className="text-mp-gray-400 shrink-0">/</span>
        <span className="text-mp-gray-900 font-medium truncate">{lesson.title}</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-display-sm text-mp-gray-900">{lesson.title}</h1>
        {lesson.description && <p className="text-body text-mp-gray-500 mt-1">{lesson.description}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column: Video + meta + back affordance */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video player — renders a graceful placeholder («Видео готовится к публикации») when videoId is null */}
          <Card id="video-player" className="overflow-hidden shadow-mp-card">
            <VideoPlayer
              ref={playerRef}
              videoId={lesson.videoId}
              onTimeUpdate={handleTimeUpdate}
              initialTime={watchProgress?.lastPosition}
              durationSeconds={lesson.duration ? lesson.duration * 60 : undefined}
            />
          </Card>

          {/* Lesson meta */}
          {lesson.duration > 0 && (
            <div className="flex items-center gap-4 text-body-sm text-mp-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {lesson.duration} мин
              </span>
            </div>
          )}

          {/* Mobile chat — below video, hidden on desktop */}
          <div className="lg:hidden">
            <ChatCard
              hasVideo={hasVideo}
              chatMessages={chatMessages}
              chatMutation={chatMutation}
              chatInput={chatInput}
              setChatInput={setChatInput}
              handleSendMessage={handleSendMessage}
              handleKeyPress={handleKeyPress}
              chatContainerRef={chatContainerRef}
              handleTimecodeClick={handleTimecodeClick}
            />
          </div>

          {/* Back to catalog */}
          <div className="pt-4 border-t border-mp-gray-200">
            <Link href="/mpstats-tools">
              <Button variant="outline" size="sm">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Назад к каталогу
              </Button>
            </Link>
          </div>
        </div>

        {/* Sidebar — chat, desktop only */}
        <div className="hidden lg:block space-y-4">
          <ChatCard
            hasVideo={hasVideo}
            chatMessages={chatMessages}
            chatMutation={chatMutation}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendMessage={handleSendMessage}
            handleKeyPress={handleKeyPress}
            chatContainerRef={chatContainerRef}
            handleTimecodeClick={handleTimecodeClick}
          />
        </div>
      </div>
    </div>
  );
}
