/**
 * Runtime gate for the internal styleguide route.
 *
 * Server-side env only (NOT NEXT_PUBLIC_*) so the page never ships in client
 * bundles of public pages. Flip with `STYLEGUIDE_ENABLED=true` in the container
 * env + `docker compose up -d` (no rebuild — the gate reads runtime env).
 *
 * On shared staging/prod Supabase, visibility is split by THIS env flag, never
 * by isHidden. Keep it `!== 'true'` strict so partial values don't expose it.
 */
export function isStyleguideEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STYLEGUIDE_ENABLED === 'true';
}
