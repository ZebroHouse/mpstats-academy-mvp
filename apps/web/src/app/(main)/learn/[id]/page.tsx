'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VideoPlayer, type PlayerHandle } from '@/components/video/KinescopePlayer';
import { TimecodeLink } from '@/components/video/TimecodeLink';
import { DiagnosticGateBanner } from '@/components/learning/DiagnosticGateBanner';
import { DiagnosticHint } from '@/components/diagnostic/DiagnosticHint';
import { LockOverlay } from '@/components/learning/LockOverlay';
import { PaywallBanner } from '@/components/learning/PaywallBanner';
import { CollapsibleSummary } from '@/components/learning/CollapsibleSummary';
import { LessonMaterials } from '@/components/learning/LessonMaterials';
import { trpc } from '@/lib/trpc/client';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import { SafeMarkdown } from '@/components/shared/SafeMarkdown';
import { CommentSection } from '@/components/comments/CommentSection';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

/** Collapsed footnotes for summary sources — only shows cited references */
function CollapsibleFootnotes({
  sources,
  onSeek,
  hasVideo,
}: {
  sources: Array<{ originalIndex: number; id: string; content: string; timecode_start: number; timecodeFormatted: string }>;
  onSeek: (seconds: number) => void;
  hasVideo: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-t border-mp-gray-200 pt-3 mt-4">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1.5 text-xs font-medium text-mp-gray-500 hover:text-mp-gray-700 transition-colors"
      >
        <svg className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Источники ({sources.length})
      </button>
      {expanded && (
        <div className="space-y-1 mt-2 animate-fade-in">
          {sources.map((source) => (
            <div key={source.id} className="flex items-start gap-2 text-xs text-mp-gray-600">
              <span className="text-mp-blue-600 font-semibold shrink-0">[{source.originalIndex}]</span>
              <span className="flex-1 line-clamp-1">{source.content.slice(0, 80)}...</span>
              <TimecodeLink
                startSeconds={source.timecode_start}
                formattedTime={source.timecodeFormatted}
                onSeek={onSeek}
                disabled={!hasVideo}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  ANALYTICS: 'Аналитика',
  MARKETING: 'Маркетинг',
  CONTENT: 'Контент',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
};

const CATEGORY_BADGES: Record<string, 'analytics' | 'marketing' | 'content' | 'operations' | 'finance'> = {
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  CONTENT: 'content',
  OPERATIONS: 'operations',
  FINANCE: 'finance',
};

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

/** Mobile-only tabbed container for AI-chat and Comments */
function MobileChatCommentsTabs({
  lessonId,
  lesson,
  chatMessages,
  chatMutation,
  chatInput,
  setChatInput,
  handleSendMessage,
  handleKeyPress,
  chatContainerRef,
  handleTimecodeClick,
}: {
  lessonId: string;
  lesson: { videoId: string | null };
  chatMessages: ChatMessage[];
  chatMutation: { isPending: boolean };
  chatInput: string;
  setChatInput: (v: string) => void;
  handleSendMessage: () => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  handleTimecodeClick: (seconds: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<'chat' | 'comments'>('chat');

  // Fetch comment count for tab label
  const { data: commentsData } = trpc.comments.list.useInfiniteQuery(
    { lessonId },
    { getNextPageParam: (last) => last?.nextCursor }
  );
  const commentCount = commentsData?.pages[0]?.totalCount ?? 0;

  return (
    <div className="lg:hidden mt-6">
      {/* Tab buttons */}
      <div className="flex border-b border-mp-gray-200 mb-4">
        <button
          className={cn(
            'flex-1 pb-2 text-sm font-medium text-center transition-colors border-b-2',
            activeTab === 'chat'
              ? 'border-mp-blue-600 text-mp-blue-600'
              : 'border-transparent text-mp-gray-500 hover:text-mp-gray-700'
          )}
          onClick={() => setActiveTab('chat')}
        >
          AI-чат
        </button>
        <button
          className={cn(
            'flex-1 pb-2 text-sm font-medium text-center transition-colors border-b-2',
            activeTab === 'comments'
              ? 'border-mp-blue-600 text-mp-blue-600'
              : 'border-transparent text-mp-gray-500 hover:text-mp-gray-700'
          )}
          onClick={() => setActiveTab('comments')}
        >
          Комментарии ({commentCount})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'chat' && (
        <Card data-tour="lesson-chat-mobile" className="h-[400px] flex flex-col shadow-mp-card">
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
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto space-y-3 mb-3"
            >
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
                  <div key={idx} className={cn(
                    'rounded-lg p-3 text-body-sm',
                    msg.role === 'user'
                      ? 'bg-mp-blue-50 text-mp-blue-900 ml-4'
                      : 'bg-mp-gray-100 text-mp-gray-800 mr-4'
                  )}>
                    <SafeMarkdown
                      content={msg.content}
                      className="prose prose-sm max-w-none"
                      sources={msg.sources}
                      onSourceSeek={handleTimecodeClick}
                      disableSourceLinks={!lesson.videoId}
                    />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="border-t border-mp-gray-200 mt-2 pt-2">
                        <p className="text-xs text-mp-gray-500">Источники:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.sources.map((src, i) => (
                            <span key={src.id} className="inline-flex items-center gap-1 text-xs">
                              <span className="text-mp-blue-600 font-medium">[{i+1}]</span>
                              <TimecodeLink
                                startSeconds={src.timecode_start}
                                formattedTime={src.timecodeFormatted}
                                onSeek={handleTimecodeClick}
                                disabled={!lesson.videoId}
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
                <Button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || chatMutation.isPending}
                  size="sm"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="mt-2 text-caption text-mp-gray-400 leading-snug">
                Я отвечаю по содержанию урока — и тому, что говорит спикер, и тому, что показано на экране (таблицы, ссылки, цифры). По сложным вопросам напиши в комментарии под уроком — модератор подтянется.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'comments' && (
        <CommentSection lessonId={lessonId} />
      )}
    </div>
  );
}

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.id as string;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle>(null);

  const handleTimecodeClick = (seconds: number) => {
    playerRef.current?.seekTo(seconds);
    document.getElementById('video-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Deep-link timecode from search results (?t=3759)
  const searchTimecode = typeof window !== 'undefined'
    ? parseInt(new URLSearchParams(window.location.search).get('t') || '', 10)
    : NaN;
  const hasSearchTimecode = !isNaN(searchTimecode) && searchTimecode > 0;

  // Watch progress: position tracking refs (no re-renders)
  const lastPositionRef = useRef<number>(0);
  const lastDurationRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const utils = trpc.useUtils();

  const { data, isLoading, error: lessonError } = trpc.learning.getLesson.useQuery({ lessonId });
  const { data: hasDiagnostic } = trpc.diagnostic.hasCompletedDiagnostic.useQuery();
  const { data: recommendedPath } = trpc.learning.getRecommendedPath.useQuery(
    undefined,
    { enabled: hasDiagnostic === true }
  );
  const { data: watchProgress } = trpc.learning.getWatchProgress.useQuery({ lessonId });

  // Sync completedRef with initial lesson status (prevent toast for already-completed lessons)
  useEffect(() => {
    if (data?.lesson?.status === 'COMPLETED') {
      completedRef.current = true;
    }
  }, [data?.lesson?.status]);

  // Track lesson open in Metrika
  useEffect(() => {
    if (data?.lesson) {
      reachGoal(METRIKA_GOALS.LESSON_OPEN, {
        courseId: data.course?.id,
        lessonId: data.lesson.id,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.lesson?.id]);

  // Phase 51 — anchor scroll к комменту с highlight (D-11, D-12)
  // URL hash #comment-<cuid> → плавный scroll + 1.5s подсветка целевого комментария
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1); // 'comment-cuid123'
    if (!hash.startsWith('comment-')) return;

    // Comments load async via tRPC — retry до 5 раз с интервалом 300ms
    const tryHighlight = (): boolean => {
      const el = document.getElementById(hash);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('notification-highlight');
      setTimeout(() => el.classList.remove('notification-highlight'), 1500);
      return true;
    };

    if (tryHighlight()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryHighlight() || attempts >= 5) clearInterval(interval);
    }, 300);
    return () => clearInterval(interval);
    // D-13: silent no-op fallback если коммент удалён или недоступен
  }, [data?.lesson?.id]);

  // Extract diagnostic hints for this lesson from the errors section
  const lessonHints = useMemo(() => {
    if (!recommendedPath?.isSectioned || !recommendedPath.sections) return [];
    const errorsSection = recommendedPath.sections.find((s: { id: string }) => s.id === 'errors');
    if (!errorsSection?.hints) return [];
    return errorsSection.hints.filter((h: { lessonId: string }) => h.lessonId === lessonId);
  }, [recommendedPath, lessonId]);

  // Summary always loads (no longer gated by tab)
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = trpc.ai.getLessonSummary.useQuery(
    { lessonId },
  );

  // Save watch progress mutation
  const saveWatchProgress = trpc.learning.saveWatchProgress.useMutation({
    onSuccess: (result) => {
      // Silently invalidate to update the badge
      utils.learning.getLesson.invalidate({ lessonId });
      // Auto-complete toast (D-04): show once when first reaching 90%+
      if (result?.status === 'COMPLETED' && !completedRef.current) {
        completedRef.current = true;
        toast.success('Урок завершён!');
        // Invalidate learn page queries for counter update
        utils.learning.getRecommendedPath.invalidate();
        utils.learning.getPath.invalidate();
        utils.learning.getCourses.invalidate();
        // Dashboard "Уроков пройдено" counter lives in profile.getDashboard
        utils.profile.getDashboard.invalidate();
      }
    },
    onError: (err) => {
      console.warn('Failed to save watch progress:', err.message);
    },
  });

  // Stable ref for mutation to avoid re-render loops
  // (useMutation returns unstable refs — putting them in useEffect/useCallback deps causes infinite loops)
  const saveWatchProgressRef = useRef(saveWatchProgress);
  saveWatchProgressRef.current = saveWatchProgress;

  // Throttled save handler (every 15 seconds) — stores in refs, no re-renders.
  // onTimeUpdate fires every ~1s from the timer; we only save periodically.
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    lastPositionRef.current = currentTime;
    lastDurationRef.current = duration;

    // If a save is already scheduled, just update the refs — don't reset the timer
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
  }, [lessonId]);

  // Save on tab hide / page unload (final position capture)
  // visibilitychange → hidden is the most reliable signal across browsers
  // (iOS Safari frequently skips beforeunload but always fires visibilitychange).
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
      // Best effort — mutation might not complete during unload
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
      // Clear pending debounce on unmount and fire final save
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

  // Chat mutation
  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (result) => {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: result.content,
        sources: result.sources,
      }]);
    },
  });

  const completeLesson = trpc.learning.completeLesson.useMutation({
    onSuccess: () => {
      // Invalidate caches so "Уроков пройдено" counter and lesson status refresh
      completedRef.current = true;
      utils.learning.getLesson.invalidate({ lessonId });
      utils.learning.getRecommendedPath.invalidate();
      utils.learning.getPath.invalidate();
      utils.learning.getCourses.invalidate();
      utils.profile.getDashboard.invalidate();
      if (data?.nextLesson) {
        router.push(`/learn/${data.nextLesson.id}`);
      } else {
        router.push('/learn');
      }
    },
  });

  // Timecode deep-link from search results (Phase 30)
  // Uses same postMessage format as diagnostic hints (JSON.stringify)
  useEffect(() => {
    if (!hasSearchTimecode) return;
    const attemptSeek = (retries = 0) => {
      const iframe = document.querySelector('iframe[src*="kinescope"]') as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ method: 'seekTo', params: [searchTimecode] }),
          '*'
        );
      } else if (retries < 15) {
        setTimeout(() => attemptSeek(retries + 1), 500);
      }
    };
    // Wait for iframe to load — initialTime handles initial position,
    // this is a fallback for cases where Kinescope ignores initialTime
    setTimeout(() => attemptSeek(), 2000);
  }, [hasSearchTimecode, searchTimecode]);

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

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    chatMutation.mutate({
      lessonId,
      message: userMessage,
      history: chatMessages.map(m => ({ role: m.role, content: m.content })),
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

  if (lessonError) {
    const isDbDown = lessonError.message === 'DATABASE_UNAVAILABLE' || lessonError.message.includes('DATABASE_UNAVAILABLE');
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-mp-card border-red-200">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-heading text-mp-gray-900 mb-2">
              {isDbDown ? 'База данных недоступна' : 'Ошибка загрузки урока'}
            </h2>
            <p className="text-body text-mp-gray-500 mb-4">
              {isDbDown
                ? 'Не удалось подключиться к базе данных. Попробуйте позже.'
                : 'Произошла ошибка при загрузке урока.'}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => router.push('/learn')}>
                К списку уроков
              </Button>
              <Button onClick={() => window.location.reload()}>
                Обновить
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.lesson) {
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
            <Button className="mt-4" onClick={() => router.push('/learn')}>
              К списку уроков
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { lesson, course, nextLesson, prevLesson, currentLessonNumber, totalLessonsInCourse } = data;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-body-sm min-w-0 overflow-hidden">
        <Link href="/learn" className="text-mp-gray-500 hover:text-mp-blue-600 transition-colors shrink-0">
          Обучение
        </Link>
        <span className="text-mp-gray-400 shrink-0">/</span>
        <Link href={`/learn#${course?.id}`} className="text-mp-gray-500 hover:text-mp-blue-600 transition-colors truncate">
          {course?.title}
        </Link>
        <span className="text-mp-gray-400 shrink-0">/</span>
        <span className="text-mp-gray-900 font-medium shrink-0">Урок {currentLessonNumber}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={CATEGORY_BADGES[lesson.skillCategory]}>
            {CATEGORY_LABELS[lesson.skillCategory]}
          </Badge>
          <span className="text-body-sm text-mp-gray-500">
            Урок {currentLessonNumber} из {totalLessonsInCourse}
          </span>
        </div>
        <h1 className="text-display-sm text-mp-gray-900">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-body text-mp-gray-500 mt-1">{lesson.description}</p>
        )}
      </div>

      {lesson.locked ? (
        <LockOverlay lessonTitle={lesson.title} />
      ) : hasDiagnostic === false ? (
        <DiagnosticGateBanner />
      ) : (
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column: Video + Summary + Navigation */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video player */}
          <Card data-tour="lesson-video" id="video-player" className="overflow-hidden shadow-mp-card">
            <VideoPlayer
              ref={playerRef}
              videoId={lesson.videoId}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                // Force-flush a 100% checkpoint when player emits Ended
                // (handles cases where the last few seconds round to 88-89%)
                if (lastDurationRef.current > 0) {
                  lastPositionRef.current = lastDurationRef.current;
                  saveWatchProgressRef.current.mutate({
                    lessonId,
                    position: lastDurationRef.current,
                    duration: lastDurationRef.current,
                  });
                }
              }}
              initialTime={hasSearchTimecode ? searchTimecode : watchProgress?.lastPosition}
              durationSeconds={lesson.duration ? lesson.duration * 60 : undefined}
            />
          </Card>

          {/* Diagnostic hint (only for lessons in Errors section) */}
          {lessonHints.length > 0 && (
            <DiagnosticHint
              lessonId={lessonId}
              hints={lessonHints}
              onSeek={(seconds) => {
                playerRef.current?.seekTo(seconds);
                document.getElementById('video-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          )}

          {/* Soft upsell banner for free lessons when billing is active */}
          {lesson.order <= 2 && totalLessonsInCourse > 2 && data.hasPlatformSubscription === false && (
            <PaywallBanner remainingFreeCount={Math.max(0, 2 - lesson.order)} />
          )}

          {/* Summary section — under video */}
          {(summaryLoading || summaryError || summaryData?.content) && (
            <div data-tour="lesson-summary" className="space-y-2">
              <h2 className="text-heading flex items-center gap-2 text-mp-gray-900">
                <svg className="w-5 h-5 text-mp-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Ключевые тезисы
                {summaryData?.fromCache && (
                  <span className="text-xs text-mp-gray-400 font-normal">(кэш)</span>
                )}
              </h2>

              <CollapsibleSummary
                isLoading={summaryLoading}
                error={summaryError?.message}
              >
                <SafeMarkdown
                  content={summaryData?.content || ''}
                  className="prose prose-sm max-w-none text-body-sm text-mp-gray-700"
                  sources={summaryData?.sources}
                  onSourceSeek={handleTimecodeClick}
                  disableSourceLinks={!lesson.videoId}
                />

                {/* Footnotes block — only sources actually cited in the text, collapsed by default */}
                {summaryData?.sources && summaryData.sources.length > 0 && (() => {
                  // Filter: only show sources that are actually referenced as [N] in the summary text
                  const citedSources = summaryData.sources
                    .map((source, idx) => ({ ...source, originalIndex: idx + 1 }))
                    .filter((_, idx) => {
                      const ref = `[${idx + 1}]`;
                      return summaryData.content?.includes(ref);
                    });
                  if (citedSources.length === 0) return null;
                  return <CollapsibleFootnotes sources={citedSources} onSeek={handleTimecodeClick} hasVideo={!!lesson.videoId} />;
                })()}
              </CollapsibleSummary>
            </div>
          )}

          {/* Phase 49 — Lesson Materials (between summary and lesson-info, per D-26) */}
          {data?.materials && (
            <LessonMaterials materials={data.materials} lessonId={lessonId} />
          )}

          {/* Lesson info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-body-sm text-mp-gray-500">
              {lesson.duration > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {lesson.duration} мин
                </span>
              )}
              <Badge variant={
                lesson.status === 'COMPLETED' ? 'success' :
                lesson.status === 'IN_PROGRESS' ? 'primary' :
                'default'
              }>
                {lesson.status === 'COMPLETED' ? 'Завершён' :
                 lesson.status === 'IN_PROGRESS' ? `${lesson.watchedPercent}% просмотрено` :
                 'Не начат'}
              </Badge>
            </div>
          </div>

          {/* Mobile tabs: AI-chat + Comments — ABOVE navigation */}
          <MobileChatCommentsTabs lessonId={lessonId} lesson={lesson} chatMessages={chatMessages} chatMutation={chatMutation} chatInput={chatInput} setChatInput={setChatInput} handleSendMessage={handleSendMessage} handleKeyPress={handleKeyPress} chatContainerRef={chatContainerRef} handleTimecodeClick={handleTimecodeClick} />

          {/* Navigation */}
          <div data-tour="lesson-nav" className="pt-4 border-t border-mp-gray-200 space-y-3">
            {/* Complete button — full width on mobile, hidden on desktop */}
            {lesson.status !== 'COMPLETED' && (
              <div className="sm:hidden">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => completeLesson.mutate({ lessonId })}
                  disabled={completeLesson.isPending}
                >
                  {completeLesson.isPending ? 'Сохранение...' : 'Завершить урок'}
                </Button>
              </div>
            )}
            {/* Prev / Complete (desktop) / Next row */}
            <div className="flex items-center justify-between">
              {prevLesson ? (
                <Link href={`/learn/${prevLesson.id}`}>
                  <Button variant="outline" size="sm">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="hidden sm:inline">Предыдущий</span>
                    <span className="sm:hidden">Назад</span>
                  </Button>
                </Link>
              ) : (
                <div />
              )}

              {/* Complete button — inline on desktop only */}
              {lesson.status !== 'COMPLETED' && (
                <Button
                  variant="success"
                  className="hidden sm:inline-flex"
                  onClick={() => completeLesson.mutate({ lessonId })}
                  disabled={completeLesson.isPending}
                >
                  {completeLesson.isPending ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Сохранение...
                    </>
                  ) : (
                    'Завершить урок'
                  )}
                </Button>
              )}

              {nextLesson ? (
                <Link href={`/learn/${nextLesson.id}`}>
                  <Button variant="outline" size="sm">
                    <span className="hidden sm:inline">Следующий</span>
                    <span className="sm:hidden">Далее</span>
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </Link>
              ) : (
                <Link href="/learn">
                  <Button variant="outline" size="sm">
                    К списку
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — Chat only (no tabs), desktop only */}
        <div className="hidden lg:block space-y-4">
          <Card data-tour="lesson-chat" className="h-[400px] flex flex-col shadow-mp-card">
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
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto space-y-3 mb-3"
              >
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
                    <div key={idx} className={cn(
                      'rounded-lg p-3 text-body-sm',
                      msg.role === 'user'
                        ? 'bg-mp-blue-50 text-mp-blue-900 ml-4'
                        : 'bg-mp-gray-100 text-mp-gray-800 mr-4'
                    )}>
                      <SafeMarkdown
                        content={msg.content}
                        className="prose prose-sm max-w-none"
                        sources={msg.sources}
                        onSourceSeek={handleTimecodeClick}
                        disableSourceLinks={!lesson.videoId}
                      />
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="border-t border-mp-gray-200 mt-2 pt-2">
                          <p className="text-xs text-mp-gray-500">Источники:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {msg.sources.map((src, i) => (
                              <span key={src.id} className="inline-flex items-center gap-1 text-xs">
                                <span className="text-mp-blue-600 font-medium">[{i+1}]</span>
                                <TimecodeLink
                                  startSeconds={src.timecode_start}
                                  formattedTime={src.timecodeFormatted}
                                  onSeek={handleTimecodeClick}
                                  disabled={!lesson.videoId}
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
                  <Button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || chatMutation.isPending}
                    size="sm"
                  >
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
                  Я отвечаю по содержанию урока — и тому, что говорит спикер, и тому, что показано на экране (таблицы, ссылки, цифры). По сложным вопросам напиши в комментарии под уроком — модератор подтянется.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Comments — desktop only (parent div is already hidden on mobile) */}
          <CommentSection lessonId={lessonId} />
        </div>
      </div>
      )}
    </div>
  );
}
