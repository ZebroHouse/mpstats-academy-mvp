import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем низкоуровневый клиент, чтобы тестировать только адаптацию в OAuthUserInfo.
vi.mock('../tochka', () => ({
  buildAuthorizeUrl: (state: string) => `https://id.tochka.com/authorize?state=${state}`,
  exchangeCodeForToken: vi.fn(),
  fetchUserInfo: vi.fn(),
  TochkaError: class extends Error {},
}));

import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from '../tochka';
import { TochkaProvider } from '../oauth-providers';

describe('TochkaProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authorizeUrl passes state through to the client', () => {
    const url = new TochkaProvider().authorizeUrl('abc123');
    expect(url).toContain('state=abc123');
  });

  it('exchangeCode returns accessToken', async () => {
    (exchangeCodeForToken as any).mockResolvedValue({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
    const res = await new TochkaProvider().exchangeCode('code');
    expect(res.accessToken).toBe('tok');
  });

  it('getUserInfo maps Tochka user_info to OAuthUserInfo with lowercased email + verified flags', async () => {
    (fetchUserInfo as any).mockResolvedValue({
      sub: 'sub-1', email: 'Besov@Tochka.com', email_verified: true,
      phone_number: '+79990000000', phone_number_verified: true,
      given_name: 'Иван', family_name: 'Бесов', name: 'Иван Бесов',
    });
    const info = await new TochkaProvider().getUserInfo('tok');
    expect(info).toMatchObject({
      id: 'sub-1',
      email: 'besov@tochka.com',
      name: 'Иван Бесов',
      phone: '+79990000000',
      emailVerified: true,
      phoneVerified: true,
    });
  });

  it('getUserInfo tolerates missing email/phone', async () => {
    (fetchUserInfo as any).mockResolvedValue({ sub: 'sub-2' });
    const info = await new TochkaProvider().getUserInfo('tok');
    expect(info.email).toBeNull();
    expect(info.phone).toBeNull();
  });
});
