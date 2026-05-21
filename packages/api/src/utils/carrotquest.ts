/**
 * Server-side CarrotQuest helper for packages/api.
 *
 * Mirrors the apps/web CQ client's wire format (form-encoded POST, Token auth,
 * by_user_id=true so Supabase UUIDs can be passed directly) but is intentionally
 * minimal — only the two operations onboarding.complete needs.
 *
 * If CARROTQUEST_API_KEY is missing, every call is a no-op (safe for dev/staging).
 * On a non-2xx response the request throws so the caller can log it; callers that
 * want fire-and-forget must wrap calls in their own try/catch.
 *
 * Docs: https://carrotquest.io/developers/
 */

const CQ_API_BASE = 'https://api.carrotquest.io/v1';

async function cqRequest(
  path: string,
  formFields: Record<string, string>,
): Promise<void> {
  const apiKey = process.env.CARROTQUEST_API_KEY;
  if (!apiKey) return; // no-op when unconfigured (dev/staging)

  const response = await fetch(`${CQ_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Token ${apiKey}`,
    },
    body: new URLSearchParams(formFields).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[CarrotQuest] API error ${response.status} on ${path}: ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Set user properties (segmentation data). CQ expects
 * operations=[{op,key,value}]. Values are stringified.
 */
export async function cqSetUserProps(
  userId: string,
  props: Record<string, string>,
): Promise<void> {
  const operations = Object.entries(props).map(([key, value]) => ({
    op: 'update_or_create',
    key,
    value: String(value),
  }));
  await cqRequest(`/users/${userId}/props`, {
    operations: JSON.stringify(operations),
    by_user_id: 'true',
  });
}

/** Track a named event for a user — used to trigger CQ automation rules. */
export async function cqTrackEvent(
  userId: string,
  event: string,
): Promise<void> {
  await cqRequest(`/users/${userId}/events`, {
    event,
    by_user_id: 'true',
  });
}
