import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createTRPCContext } from '@mpstats/api';
import { createClient } from '@/lib/supabase/server';

const handler = async (req: Request) => {
  const supabase = await createClient();

  // Get user but don't fail if no auth - public procedures should work without auth
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch (error) {
    // No auth cookies - user remains null, public procedures will still work
    console.log('[tRPC] No auth session found, continuing as anonymous');
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(user, req),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`[tRPC Error] ${path ?? '<no-path>'}: ${error.message}`);
          }
        : undefined,
  });
};

export { handler as GET, handler as POST };
