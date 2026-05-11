/**
 * Server-side CloudPayments subscription cancellation.
 * Uses CloudPayments REST API with HTTP Basic Auth.
 *
 * Docs: https://developers.cloudpayments.ru/#otmena-podpiski
 */

const CP_CANCEL_URL = 'https://api.cloudpayments.ru/subscriptions/cancel';

interface CPCancelResponse {
  Success: boolean;
  Message?: string | null;
}

export type CancelResult =
  | { ok: true; alreadyCancelled?: boolean }
  | { ok: false; reason: string };

/**
 * Cancel a CloudPayments recurrent subscription by their `sc_*` id.
 * Returns a discriminated result so callers can decide whether to proceed
 * with local DB updates or surface the error to the user.
 *
 * Treats "already cancelled" CP responses as success — that's the
 * desired end state for our cancel flow.
 */
export async function cancelCloudPaymentsSubscription(
  cpSubscriptionId: string,
): Promise<CancelResult> {
  const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID;
  const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET;

  if (!publicId || !apiSecret) {
    return { ok: false, reason: 'CloudPayments credentials not configured' };
  }

  const credentials = Buffer.from(`${publicId}:${apiSecret}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(CP_CANCEL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ Id: cpSubscriptionId }),
    });
  } catch (error) {
    return {
      ok: false,
      reason: `CP cancel network error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `CP cancel HTTP ${response.status} ${response.statusText}`,
    };
  }

  let data: CPCancelResponse;
  try {
    data = (await response.json()) as CPCancelResponse;
  } catch (error) {
    return {
      ok: false,
      reason: `CP cancel response not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (data.Success === true) return { ok: true };

  // CP returns Success=false when subscription is already cancelled/expired —
  // for our purposes that's the same desired end state.
  const msg = (data.Message ?? '').toLowerCase();
  if (
    msg.includes('already') ||
    msg.includes('cancel') ||
    msg.includes('not found') ||
    msg.includes('не найден')
  ) {
    return { ok: true, alreadyCancelled: true };
  }

  return { ok: false, reason: `CP cancel rejected: ${data.Message ?? 'unknown reason'}` };
}
