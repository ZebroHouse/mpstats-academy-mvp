/**
 * Сводка по журналу контента и устройств — чтобы видеть, как копятся данные,
 * пока дашборды (спеки B и C) ещё не сделаны.
 *
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/content-journal-stats.ts
 *
 * Читает только. Ничего не меняет.
 *
 * ⚠️ Каветаты, без которых цифры прочитаются неверно:
 *  - Тестовые пользователи (`UserProfile.isTest`) и админы НЕ исключаются.
 *  - `UserDeviceDay` — это юзер-дни, а не сессии: человек, сидевший весь день
 *    с телефона, даёт ровно одну строку, как и заглянувший на минуту.
 *  - Активное время для TEXT/INTERACTIVE — это время видимости вкладки, оно
 *    несопоставимо с видео. Поэтому разрез по типу контента, а не общий средний.
 *  - `completed` тут — порог 90% просмотра, и он всегда false для текстовых
 *    уроков. Настоящая завершённость живёт в `LessonProgress`.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

(async () => {
  const totalViews = await p.contentView.count();
  if (totalViews === 0) {
    console.log('Журнал пуст. Либо флаг CONTENT_JOURNAL_ENABLED выключен, либо ещё никто не открывал урок с момента запуска.');
    await p.$disconnect();
    return;
  }

  const first = await p.contentView.findFirst({ orderBy: { startedAt: 'asc' }, select: { startedAt: true } });
  const days = first ? Math.max(1, Math.ceil((Date.now() - first.startedAt.getTime()) / 86_400_000)) : 1;
  console.log(`\n=== Журнал контента: ${totalViews} заходов за ${days} дн. (с ${first?.startedAt.toISOString().slice(0, 10)}) ===`);

  const uniqueUsers = await p.contentView.findMany({ distinct: ['userId'], select: { userId: true } });
  const uniqueLessons = await p.contentView.findMany({ distinct: ['lessonId'], select: { lessonId: true } });
  console.log(`уникальных пользователей: ${uniqueUsers.length}, уникальных уроков: ${uniqueLessons.length}`);
  console.log(`заходов на пользователя: ${(totalViews / Math.max(1, uniqueUsers.length)).toFixed(1)}`);

  console.log('\n--- по типу контента (активное время НЕ усреднять между типами) ---');
  const byType = await p.contentView.groupBy({
    by: ['contentType'],
    _count: { _all: true },
    _avg: { activeSeconds: true, maxPercent: true },
  });
  for (const t of byType) {
    console.log(
      `  ${t.contentType.padEnd(12)} заходов ${String(t._count._all).padStart(6)} | ` +
      `ср. активное ${Math.round(t._avg.activeSeconds ?? 0)}с | ср. глубина ${Math.round(t._avg.maxPercent ?? 0)}%`,
    );
  }

  console.log('\n--- по устройствам ---');
  const byDevice = await p.contentView.groupBy({
    by: ['device'],
    _count: { _all: true },
    _avg: { activeSeconds: true },
  });
  for (const d of byDevice) {
    console.log(
      `  ${d.device.padEnd(8)} заходов ${String(d._count._all).padStart(6)} (${pct(d._count._all, totalViews)}) | ` +
      `ср. активное ${Math.round(d._avg.activeSeconds ?? 0)}с`,
    );
  }

  console.log('\n--- повторные заходы (то, чего LessonProgress не умеет) ---');
  const repeats = await p.$queryRawUnsafe<Array<{ opens: bigint; pairs: bigint }>>(`
    SELECT opens, COUNT(*) AS pairs FROM (
      SELECT "userId", "lessonId", COUNT(*) AS opens
      FROM "ContentView" GROUP BY "userId", "lessonId"
    ) t GROUP BY opens ORDER BY opens
  `);
  for (const r of repeats) {
    console.log(`  ${r.opens} заход(ов) в один урок: ${r.pairs} пар «юзер-урок»`);
  }

  console.log('\n=== Устройства пользователей (юзер-дни, НЕ сессии) ===');
  const deviceDays = await p.userDeviceDay.groupBy({ by: ['device'], _count: { _all: true } });
  const totalDeviceDays = deviceDays.reduce((s, d) => s + d._count._all, 0);
  for (const d of deviceDays) {
    console.log(`  ${d.device.padEnd(8)} ${String(d._count._all).padStart(6)} юзер-дней (${pct(d._count._all, totalDeviceDays)})`);
  }

  const multi = await p.$queryRawUnsafe<Array<{ users: bigint }>>(`
    SELECT COUNT(*) AS users FROM (
      SELECT "userId" FROM "UserDeviceDay"
      GROUP BY "userId" HAVING COUNT(DISTINCT "device") > 1
    ) t
  `);
  const anyUser = await p.$queryRawUnsafe<Array<{ users: bigint }>>(
    `SELECT COUNT(DISTINCT "userId") AS users FROM "UserDeviceDay"`,
  );
  console.log(`  пользуются больше чем одним устройством: ${multi[0]?.users ?? 0} из ${anyUser[0]?.users ?? 0}`);

  console.log('\n=== Диагностика по устройствам ===');
  const diag = await p.diagnosticSession.groupBy({
    by: ['device'],
    _count: { _all: true },
    where: { device: { not: null } },
  });
  if (diag.length === 0) {
    console.log('  сессий с записанным устройством пока нет');
  } else {
    for (const d of diag) console.log(`  ${String(d.device).padEnd(8)} ${d._count._all}`);
  }

  console.log('');
  await p.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e);
  await p.$disconnect();
  process.exit(1);
});
