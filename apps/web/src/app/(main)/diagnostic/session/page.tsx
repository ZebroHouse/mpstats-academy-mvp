'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Question } from '@/components/diagnostic/Question';
import { ProgressBar } from '@/components/diagnostic/ProgressBar';
import { trpc } from '@/lib/trpc/client';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';

export default function DiagnosticSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');

  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
  } | null>(null);

  // Loading state for "next question" transition
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);

  const { data: sessionState, isLoading, refetch } = trpc.diagnostic.getSessionState.useQuery(
    { sessionId: sessionId! },
    {
      enabled: !!sessionId,
      gcTime: 0,
      staleTime: 0,
    }
  );

  const [isComplete, setIsComplete] = useState(false);

  const submitAnswer = trpc.diagnostic.submitAnswer.useMutation({
    onSuccess: (data) => {
      setFeedback({
        isCorrect: data.isCorrect,
        correctIndex: data.correctIndex,
        explanation: data.explanation,
      });
      setIsComplete(data.isComplete);
    },
    onError: (error) => {
      // Handle auth/network errors gracefully — don't leave user stuck
      console.error('[diagnostic] submitAnswer error:', error.message);
      setFeedback(null);
    },
  });

  const handleNext = useCallback(async () => {
    if (isComplete) {
      router.push(`/diagnostic/results?id=${sessionId}`);
      return;
    }

    setIsTransitioning(true);

    // Retry refetch up to 2 times on failure (Supabase ECONNRESET)
    let attempts = 0;
    while (attempts < 3) {
      try {
        const result = await refetch();
        if (result.data?.currentQuestion) {
          setFeedback(null);
          break;
        }
        // If no currentQuestion (session complete?), check completion
        if (result.data?.isComplete) {
          router.push(`/diagnostic/results?id=${sessionId}`);
          break;
        }
        attempts++;
      } catch {
        attempts++;
        if (attempts < 3) {
          // Wait briefly before retry
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    setIsTransitioning(false);
  }, [isComplete, sessionId, router, refetch]);

  const handleAnswer = useCallback((selectedIndex: number) => {
    if (!sessionState?.currentQuestion || !sessionId) return;
    // Prevent double-submission
    if (submitAnswer.isPending) return;

    submitAnswer.mutate({
      sessionId,
      questionId: sessionState.currentQuestion.id,
      selectedIndex,
    });
  }, [sessionState?.currentQuestion, sessionId, submitAnswer]);

  // Redirect if no session
  useEffect(() => {
    if (!sessionId) {
      router.push('/diagnostic');
    }
  }, [sessionId, router]);

  // Redirect if session complete (handles page reload mid-session)
  useEffect(() => {
    if (sessionState?.isComplete) {
      router.push(`/diagnostic/results?id=${sessionId}`);
    }
  }, [sessionState?.isComplete, sessionId, router]);

  // Track diagnostic start in Metrika
  useEffect(() => {
    if (sessionState?.currentQuestion && sessionState.currentQuestionIndex === 0) {
      reachGoal(METRIKA_GOALS.DIAGNOSTIC_START);
    }
  }, [sessionState?.currentQuestion, sessionState?.currentQuestionIndex]);

  // Show slow hint after 3 seconds of loading
  useEffect(() => {
    if (!isLoading) {
      setShowSlowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowHint(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!sessionId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-mp-card">
          <CardContent className="py-12 text-center">
            <svg className="animate-spin h-10 w-10 mx-auto text-mp-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="mt-4 text-body font-medium text-mp-gray-700 animate-pulse">
              Готовим вопросы...
            </p>
            <p className="mt-2 text-body-sm text-mp-gray-400">
              AI подбирает вопросы на основе учебных материалов
            </p>
            {showSlowHint && (
              <p className="mt-2 text-body-sm text-mp-gray-400 animate-fade-in">
                Это может занять несколько секунд...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionState || !sessionState.currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-mp-card">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-body text-mp-gray-500">Сессия не найдена</p>
            <Button className="mt-4" onClick={() => router.push('/diagnostic')}>
              Начать заново
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <ProgressBar
        current={sessionState.currentQuestionIndex + 1}
        total={sessionState.totalQuestions}
      />

      {/* Question card */}
      <Card className="shadow-mp-card">
        <CardContent className="py-8">
          <Question
            key={sessionState.currentQuestion.id}
            question={sessionState.currentQuestion}
            onAnswer={handleAnswer}
            isSubmitting={submitAnswer.isPending}
            feedback={feedback}
            userMarketplaces={sessionState.userMarketplaces}
          />
        </CardContent>
      </Card>

      {/* Next button after feedback */}
      {feedback && (
        <div className="text-center">
          <Button
            onClick={handleNext}
            disabled={isTransitioning}
            size="lg"
            className="w-full sm:w-auto"
          >
            {isTransitioning ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Загрузка...
              </>
            ) : (
              <>
                {isComplete ? 'Посмотреть результаты' : 'Следующий вопрос'}
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
