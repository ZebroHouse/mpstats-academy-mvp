-- ============================================================
-- Fix: handle_new_user must persist phone from auth metadata
-- ============================================================
-- Bug (found 2026-06-30): email registrations collected a required
-- phone into auth.users.raw_user_meta_data.phone, but the trigger
-- handle_new_user (fired AFTER INSERT on auth.users) created the
-- UserProfile row WITHOUT phone. ensureUserProfile only hits its
-- update branch afterwards (profile already exists) and never
-- backfills phone, so UserProfile.phone stayed empty forever for
-- every email user. The sales client registry and the amoCRM lead
-- (sendAcademyLead) both read UserProfile.phone -> they showed/sent
-- empty phones for the email cohort (the majority of signups).
--
-- Yandex was unaffected: yandex/callback explicitly upserts phone
-- into both create AND update branches, overwriting the trigger row.
--
-- Fix: add phone to the trigger INSERT so it is captured at source
-- (signUp). Matches the live prod definition + phone column.
-- Applied to prod via Supabase Mgmt API on 2026-06-30 (function
-- replace, no table DDL). A one-time backfill copied the stranded
-- raw_user_meta_data.phone into UserProfile.phone for 176 existing
-- rows separately.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."UserProfile" (
    id, name, "avatarUrl", phone, role, "isActive", "createdAt", "updatedAt"
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone',
    'USER',
    true,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;
