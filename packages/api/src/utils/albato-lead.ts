/**
 * Academy registration lead → Albato webhook → amoCRM.
 *
 * Fired exactly once per user from onboarding.complete — the single persistence
 * point of the unskippable welcome wizard (the (main) layout guard bounces every
 * user to /welcome until onboardingCompletedAt is set). So every registered user,
 * email-DOI or Yandex, produces one lead in amoCRM, routed by Albato.
 *
 * Pattern mirrors go.mpstats lib/albato.ts: a single env webhook URL, a flat JSON
 * POST, an 8s timeout, fully best-effort. Enum codes are mapped to the verbatim
 * Russian labels the user sees in the wizard so the sales team reads human values.
 *
 * If ALBATO_WEBHOOK_URL is missing every call is a no-op (safe for dev/staging).
 * On a non-2xx response the request throws so the caller can log it; the caller
 * (onboarding.complete) wraps this in its own try/catch — a lead failure must
 * never block or fail onboarding.
 */

// Verbatim from apps/web welcome wizard options (56-UI-SPEC Copywriting Contract).
// Kept here (not imported) because options.ts is a client module with lucide-react
// deps that must not be pulled into the server bundle. Keys are the locked z.enum
// whitelists in the onboarding router — they are the contract, labels are display.
const MARKETPLACE_LABELS: Record<string, string> = {
  WB: 'Wildberries',
  OZON: 'Ozon',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  PROSPECTING: 'Только присматриваюсь',
  BEGINNER: 'Новичок',
  STABLE: 'Есть стабильные продажи',
  ADVANCED: 'Опытный селлер',
};

const GOAL_LABELS: Record<string, string> = {
  SALES: 'Увеличить продажи',
  ADS: 'Снизить расходы на рекламу',
  CONTENT: 'Улучшить карточки товара',
  ANALYTICS: 'Разобраться в аналитике и нишах',
  OPERATIONS: 'Навести порядок в операциях и логистике',
  FINANCE: 'Финансы и юнит-экономика',
  NEW_MARKETPLACE: 'Выйти на новый маркетплейс',
};

export interface AcademyLeadInput {
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  yandexId: string | null;
  /** Code the user ARRIVED with (Referral.code), not their own shareable code. */
  referralCode: string | null;
  marketplaces: string[]; // enum keys
  experienceLevel: string | null; // enum key
  goals: string[]; // enum keys
  goalText: string | null;
  /** currentPeriodEnd of the user's TRIAL subscription, or null if none. */
  trialEndsAt: Date | null;
  registeredAt: Date; // profile.createdAt
  now: Date;
  /**
   * Partner-origin lead (MPSTATS seamless-entry, user_metadata.partner_source
   * === 'mpstats'). Tags registration_source distinctly so Albato can route
   * these to a separate funnel / deal name. Does NOT add a field — the payload
   * shape (14 keys) is unchanged, only the registration_source VALUE differs.
   */
  isPartner?: boolean;
}

export interface AcademyLeadPayload {
  user_id: string;
  name: string;
  phone: string;
  email: string;
  registration_source: string;
  referral_code: string;
  marketplaces: string;
  experience: string;
  goals: string;
  goal_text: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  registered_at: string;
  timestamp: string;
}

export function buildAcademyLeadPayload(input: AcademyLeadInput): AcademyLeadPayload {
  const trialActive =
    input.trialEndsAt != null && input.trialEndsAt.getTime() > input.now.getTime();

  return {
    user_id: input.userId,
    name: input.name ?? '',
    phone: input.phone ?? '',
    email: input.email ?? '',
    registration_source: input.isPartner
      ? 'MPSTATS Инструменты'
      : input.yandexId
        ? 'Яндекс'
        : 'Email',
    referral_code: input.referralCode ?? '',
    marketplaces: input.marketplaces.map((m) => MARKETPLACE_LABELS[m] ?? m).join(', '),
    experience: input.experienceLevel
      ? (EXPERIENCE_LABELS[input.experienceLevel] ?? input.experienceLevel)
      : '',
    goals: input.goals.map((g) => GOAL_LABELS[g] ?? g).join(', '),
    goal_text: input.goalText ?? '',
    trial_active: trialActive,
    trial_ends_at: input.trialEndsAt ? input.trialEndsAt.toISOString() : null,
    registered_at: input.registeredAt.toISOString(),
    timestamp: input.now.toISOString(),
  };
}

export async function sendAcademyLead(input: AcademyLeadInput): Promise<void> {
  const webhookUrl = process.env.ALBATO_WEBHOOK_URL;
  if (!webhookUrl) return; // no-op when unconfigured (dev/staging)

  const payload = buildAcademyLeadPayload(input);

  // Sanitize errors: a raw fetch/network error object can embed the secret
  // webhook URL (host/port in `cause`). Never let it propagate to the caller's
  // logger — rethrow a status-only / generic message instead.
  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('[AlbatoLead] network error sending lead');
  }

  if (!response.ok) {
    throw new Error(`[AlbatoLead] webhook error ${response.status}`);
  }
}
