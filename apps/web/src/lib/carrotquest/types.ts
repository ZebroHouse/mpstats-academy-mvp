/**
 * Carrot Quest event types for transactional email triggers.
 * Each event maps to a CQ automation rule that sends the email.
 *
 * All events use `pa_` prefix (Platform Academy) per CQ team spec.
 */
export type CQEventName =
  // Payment & Billing
  | 'pa_payment_success'
  | 'pa_payment_failed'
  | 'pa_subscription_cancelled'
  | 'pa_subscription_expiring'
  // Registration
  | 'pa_registration_completed'
  // Inactivity
  | 'pa_inactive_7'
  | 'pa_inactive_14'
  | 'pa_inactive_30'
  // Support
  | 'pa_support_request'
  // Promo
  | 'pa_promo_activated'
  // Auth hook events (sent via Supabase Send Email Hook)
  | 'pa_doi'
  | 'pa_password_reset'
  | 'pa_email_change'
  // Notifications (Phase 51) — fired by services/notifications.ts notify()
  | 'pa_notif_comment_reply'
  | 'pa_notif_admin_comment_reply'
  | 'pa_notif_content_update'
  | 'pa_notif_progress_nudge'
  | 'pa_notif_inactivity_return'
  | 'pa_notif_weekly_digest'
  | 'pa_notif_broadcast'
  // Referral (Phase 53A)
  | 'pa_referral_trial_started'
  | 'pa_referral_friend_registered'
  | 'pa_referral_friend_paid'
  // Onboarding (Phase 56)
  | 'pa_onboarding_completed';

/**
 * Event data payload — flat key-value map sent alongside the event.
 */
export type CQEventData = Record<string, string | number | boolean | null>;
