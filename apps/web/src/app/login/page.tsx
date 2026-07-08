import { LoginPageClient } from './login-form';

// Read TOCHKA_LOGIN_ENABLED at request time so the flag flips without a rebuild
// (ship-dark → runtime flip rollout). Without this the page prerenders and the
// build-time flag value freezes, hiding the button until a full rebuild.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const tochkaEnabled = process.env.TOCHKA_LOGIN_ENABLED === 'true';
  return <LoginPageClient tochkaEnabled={tochkaEnabled} />;
}
