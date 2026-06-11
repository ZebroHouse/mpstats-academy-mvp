// apps/web/src/app/partner/check-email/page.tsx
export const dynamic = 'force-dynamic';

export default function PartnerCheckEmailPage({ searchParams }: { searchParams: { email?: string } }) {
  const email = searchParams.email ?? '';
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Проверьте почту</h1>
      <p className="mt-3 text-muted-foreground">
        {email ? <>Мы отправили ссылку для входа на <span className="font-medium">{email}</span>.</> : <>Мы отправили ссылку для входа на вашу почту.</>}{' '}
        Перейдите по ней, чтобы открыть бесплатный курс по инструментам MPSTATS.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">Письма нет? Проверьте «Спам» или вернитесь и попробуйте ещё раз.</p>
    </main>
  );
}
