'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { YandexProvider, TochkaProvider } from '@/lib/auth/oauth-providers';


export type AuthResult = {
  error?: string;
  success?: boolean;
};

// ============== SIGN UP ==============

export async function signUp(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const promo = (formData.get('promo') as string | null)?.trim().toUpperCase() || null;

  if (!email || !password) {
    return { error: 'Email и пароль обязательны' };
  }

  if (!name?.trim()) {
    return { error: 'Имя обязательно' };
  }

  if (!phone?.trim()) {
    return { error: 'Телефон обязателен' };
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return { error: 'Некорректный номер телефона' };
  }

  if (password.length < 6) {
    return { error: 'Пароль должен быть минимум 6 символов' };
  }

  // Если пользователь пришёл с промо-кодом — протаскиваем его через DOI-цикл.
  // После клика на письмо /auth/callback редиректит на ?next=, а /pricing
  // уже авторизованного юзера автоматически активирует промо из URL.
  const callbackUrl = promo
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(`/pricing?promo=${promo}`)}`
    : `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        phone,
        ...(promo ? { pending_promo: promo } : {}),
      },
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) {
    console.error('Sign up error:', error);
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('weak') && msg.includes('password')) {
      return { error: 'Этот пароль слишком распространённый и легко угадывается. Придумай другой — например, комбинацию букв, цифр и символов, которую нигде больше не используешь.' };
    }
    if (msg.includes('already registered') || msg.includes('user already exists')) {
      return { error: 'Пользователь с таким email уже зарегистрирован. Попробуй войти.' };
    }
    if (msg.includes('invalid email')) {
      return { error: 'Некорректный email' };
    }
    return { error: error.message };
  }

  // pa_registration_completed fires in auth/callback/route.ts after DOI confirmation
  return { success: true };
}

// ============== SIGN IN ==============

export async function signIn(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email и пароль обязательны' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error);
    if (error.message?.includes('Email not confirmed')) {
      return { error: 'Подтвердите email — мы отправили письмо со ссылкой на указанную почту' };
    }
    return { error: 'Неверный email или пароль' };
  }

  revalidatePath('/', 'layout');
  // Клиент делает hard navigation вместо redirect() чтобы пересоздать
  // React Query cache и не показывать данные предыдущего юзера.
  return { success: true };
}

// ============== SIGN IN WITH YANDEX ==============

export async function signInWithYandex(): Promise<AuthResult> {
  const state = crypto.randomUUID();

  // Store state in httpOnly cookie for CSRF verification in callback
  const cookieStore = await cookies();
  cookieStore.set('yandex_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const provider = new YandexProvider();
  redirect(provider.authorizeUrl(state));
}

// ============== SIGN IN WITH TOCHKA ==============

export async function signInWithTochka(): Promise<AuthResult> {
  // Flag-gated rollout (ship dark → staging → prod flip). Off = inert.
  if (process.env.TOCHKA_LOGIN_ENABLED !== 'true') {
    return { error: 'Вход через Точку временно недоступен' };
  }

  const state = crypto.randomUUID();

  // Store state in httpOnly cookie for CSRF verification in callback.
  // Path scoped to the Tochka auth routes (tighter than Yandex's '/').
  const cookieStore = await cookies();
  cookieStore.set('tochka_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/auth/tochka',
  });

  const provider = new TochkaProvider();
  redirect(provider.authorizeUrl(state));
}

// ============== SIGN OUT ==============

export async function signOut(): Promise<AuthResult> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  // Клиент делает hard reload чтобы пересоздать React Query cache —
  // иначе следующий юзер видит данные предыдущего из памяти TanStack.
  return { success: true };
}

// ============== PASSWORD RESET ==============

export async function resetPasswordRequest(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email обязателен' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error('Password reset error:', error);
    return { error: error.message };
  }

  return { success: true };
}

export async function updatePassword(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || password.length < 6) {
    return { error: 'Пароль должен быть минимум 6 символов' };
  }

  if (password !== confirmPassword) {
    return { error: 'Пароли не совпадают' };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error('Update password error:', error);
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('weak') && msg.includes('password')) {
      return { error: 'Этот пароль слишком распространённый и легко угадывается. Придумай другой — например, комбинацию букв, цифр и символов, которую нигде больше не используешь.' };
    }
    if (msg.includes('auth session missing') || msg.includes('session missing')) {
      return { error: 'Ссылка для смены пароля истекла. Запроси новое письмо на странице «Забыл пароль».' };
    }
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

// ============== GET USER ==============

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
