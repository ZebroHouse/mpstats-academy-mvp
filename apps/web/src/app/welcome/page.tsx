'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WizardStepper } from '@/components/welcome/WizardStepper';
import { StepIntent } from '@/components/welcome/StepIntent';
import { StepMarketplaces } from '@/components/welcome/StepMarketplaces';
import { StepExperience } from '@/components/welcome/StepExperience';
import { ForkScreen } from '@/components/welcome/ForkScreen';
import { GOAL_OPTIONS } from '@/components/welcome/options';

type Step = 1 | 2 | 3 | 'fork';

/**
 * Onboarding wizard orchestrator.
 * Client-side useState stepper (1 → 2 → 3 → fork). Answers accumulate locally;
 * a single onboarding.complete mutation persists everything at the fork.
 *
 * Navigation off the fork uses a hard load (window.location.assign), NOT
 * router.push. The (main) layout guard redirects to /welcome while
 * onboardingCompletedAt is null; after a soft navigation Next's client Router
 * Cache can replay a stale pre-onboarding render of that guard — bouncing the
 * user back into the wizard even though complete() already wrote the flag
 * (prod incident 2026-05-19). A full load discards the Router Cache so the
 * guard re-renders server-side against the freshly-written flag.
 */
export default function WelcomePage() {
  const [step, setStep] = useState<Step>(1);
  const [goals, setGoals] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string | null>(null);

  const { data: profile } = trpc.profile.get.useQuery();
  const userName = profile?.name?.trim().split(' ')[0] || null;

  const complete = trpc.onboarding.complete.useMutation({
    onError: () => toast.error('Не удалось сохранить ответы. Попробуйте ещё раз.'),
  });

  const finish = (dest: '/diagnostic' | '/learn') => {
    complete.mutate(
      {
        goals: goals as never,
        goalText,
        marketplaces: marketplaces as never,
        experienceLevel: experienceLevel as never,
      },
      { onSuccess: () => window.location.assign(dest) },
    );
  };

  // Honest reframe — client-side echo of the chosen goals, no LLM.
  const reframe = (() => {
    const labels = goals
      .map((g) => GOAL_OPTIONS.find((o) => o.key === g)?.label.toLowerCase())
      .filter(Boolean);
    if (labels.length === 0) return null;
    return `Поняли — хотите ${labels.join(', ')}. Подберём под это материалы.`;
  })();

  return (
    <Card className="w-full max-w-2xl data-[fork=true]:max-w-3xl" data-fork={step === 'fork'}>
      <CardContent className="space-y-8 p-4 sm:p-6">
        {step !== 'fork' && <WizardStepper current={step} />}

        {step === 1 && (
          <StepIntent
            userName={userName}
            goals={goals}
            goalText={goalText}
            onGoalsChange={setGoals}
            onGoalTextChange={setGoalText}
          />
        )}

        {step === 2 && (
          <div className="space-y-6">
            {reframe && (
              <div className="rounded-lg bg-mp-blue-50 p-4 text-body text-mp-gray-700">
                {reframe}
              </div>
            )}
            <StepMarketplaces marketplaces={marketplaces} onChange={setMarketplaces} />
          </div>
        )}

        {step === 3 && (
          <StepExperience experienceLevel={experienceLevel} onChange={setExperienceLevel} />
        )}

        {step === 'fork' && (
          <ForkScreen
            userName={userName}
            isSaving={complete.isPending}
            onChoose={finish}
          />
        )}

        {step !== 'fork' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                className={step === 1 ? 'invisible' : ''}
                onClick={() => setStep((s) => (s === 'fork' ? 3 : ((s - 1) as Step)))}
              >
                ← Назад
              </Button>
              <Button
                variant="default"
                onClick={() =>
                  setStep((s) => (s === 3 ? 'fork' : ((s as number) + 1) as Step))
                }
              >
                {step === 1 ? 'Продолжить' : 'Далее →'}
              </Button>
            </div>
            <p className="text-center text-caption text-mp-gray-400">
              Ответы помогут персонализировать ваш опыт.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
