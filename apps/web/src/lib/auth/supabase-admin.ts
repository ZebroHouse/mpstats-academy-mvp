/**
 * Supabase Admin Client (server-only).
 *
 * Uses SUPABASE_SECRET_KEY for privileged operations:
 * - Creating users via Admin API
 * - Generating magic links for session creation
 * - Managing user metadata
 *
 * IMPORTANT: This file must NEVER be imported in client components.
 * Only use in Route Handlers and server-side code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables'
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
