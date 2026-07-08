import { LoginPageClient } from './login-form';

export default function LoginPage() {
  const tochkaEnabled = process.env.TOCHKA_LOGIN_ENABLED === 'true';
  return <LoginPageClient tochkaEnabled={tochkaEnabled} />;
}
