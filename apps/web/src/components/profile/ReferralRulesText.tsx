'use client';

export function ReferralRulesText() {
  const i2Mode = process.env.NEXT_PUBLIC_REFERRAL_PAY_GATED === 'true';
  return (
    <div className="rounded-lg border border-mp-blue-200 bg-mp-blue-50 p-4 text-sm text-mp-gray-800">
      <div className="font-semibold mb-1">Как это работает</div>
      {i2Mode ? (
        <ul className="list-disc list-inside space-y-1">
          <li>Друг переходит по вашей ссылке и регистрируется — получает 7 дней Платформы бесплатно.</li>
          <li>Когда друг оплачивает первую подписку, вы получаете пакет +14 дней.</li>
          <li>Активируйте пакет вручную здесь — он продлит подписку или создаст новый 14-дневный триал.</li>
        </ul>
      ) : (
        <ul className="list-disc list-inside space-y-1">
          <li>Друг переходит по вашей ссылке и регистрируется — сразу получает 14 дней Платформы бесплатно.</li>
          <li>Вы получаете пакет +14 дней за каждого зарегистрированного друга.</li>
          <li>Активируйте пакет здесь — он продлит вашу подписку на 14 дней или запустит новый триал.</li>
        </ul>
      )}
    </div>
  );
}
