/**
 * Программный сид первой пачки редакторских тегов (storefront badges) на уроки/джобы.
 * БЕЗОПАСЕН: обновляет ТОЛЬКО перечисленные ниже строки. По умолчанию dry-run.
 * Запуск:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts            # dry-run
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts --apply    # запись
 * Теги: START | NEW | HOT | QUICK (см. таксономию в spec).
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');

// ── Первая пачка редакторских тегов (утверждена owner 2026-06-29). ──
// Урок: ключ = Lesson.id. Дальше методологи правят через админку (будущая фаза).
const LESSON_BADGES: Record<string, string[]> = {
  // START — «Начни отсюда» (твёрдый фундамент селлерства)
  '01_analytics_m02_economics_001': ['START'], // Юнит-экономика: погружение в ключевые показатели
  '01_analytics_m01_start_002': ['START'],     // Для чего нужна аналитика для бизнеса на МП
  // HOT — «Хит платформы» (по реальным завершениям, тест-юзеры исключены)
  'skill_analytics_assortment_001': ['HOT'],        // Ассортимент как система (17)
  'skill_marketing_ad_metrics_001': ['HOT'],        // Как читать эффективность РК (15)
  'skill_analytics_focus_products_001': ['HOT'],    // Вероятность продажи и ранжирование (15)
  '02_ads_m01_prep_001': ['HOT'],                   // Почему WB не показывает вашу карточку (12)
  'skill_marketing_seo_optimization_001': ['HOT'],  // SEO 2026 — выдача на WB и Ozon (11)
  '05_ozon_m01_economics_001': ['HOT'],             // Расходы на Ozon (11, Ozon-сторона)
  // QUICK — «Быстрые победы» (короткие И полезные, не навигация/оплата)
  'skill_analytics_target_audience_001': ['QUICK'], // Этапы анализа ЦА (6 мин)
  'skill_analytics_sales_forecast_001': ['QUICK'],  // Планирование продаж на WB (6 мин)
  'skill_analytics_assortment_002': ['QUICK'],      // Матрица решений по ассортименту (6 мин)
  '05_ozon_m01_economics_003': ['QUICK'],           // Плановая юнит-экономика, Ozon (3 мин)
};
// Джоба: ключ = Job.slug.
const JOB_BADGES: Record<string, string[]> = {
  // HOT — флагман-джобы
  'snizit-drr-i-ostanovit-sliv-byudzheta': ['HOT'],          // Снизить ДРР и слив бюджета
  'nayti-pribylnuyu-poziciyu-i-stavku-po-klyuchu': ['HOT'],  // Найти позицию и ставку по ключу
  // NEW — свежие джобы (createdAt 25.06), marketplace BOTH
  'sobrat-neyroassistenta-pod-zadachu-marketpleysa': ['NEW'],            // Собрать НейроАссистента
  'sobrat-seo-yadro-i-proverit-pozicii-kartochki': ['NEW'],             // Собрать SEO-ядро и позиции
  'sozdat-video-dlya-kartochki-cherez-ii-ot-scenariya-do-montaz': ['NEW'], // Видео для карточки через ИИ
  'vybrat-nishu-i-tovar-cherez-ii-analiz': ['NEW'],                     // Выбрать нишу и товар через ИИ
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`${APPLY ? '' : '[DRY-RUN] '}Уроки (${Object.keys(LESSON_BADGES).length}):`);
    for (const [id, badges] of Object.entries(LESSON_BADGES)) {
      const lesson = await prisma.lesson.findUnique({ where: { id }, select: { id: true, title: true } });
      if (!lesson) { console.log(`  ⚠ урок не найден: ${id} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${lesson.title}`);
      if (APPLY) await prisma.lesson.update({ where: { id }, data: { badges } });
    }
    console.log(`\n${APPLY ? '' : '[DRY-RUN] '}Джобы (${Object.keys(JOB_BADGES).length}):`);
    for (const [slug, badges] of Object.entries(JOB_BADGES)) {
      const job = await prisma.job.findUnique({ where: { slug }, select: { slug: true, title: true } });
      if (!job) { console.log(`  ⚠ джоба не найдена: ${slug} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${job.title}`);
      if (APPLY) await prisma.job.update({ where: { slug }, data: { badges } });
    }
    console.log(`\n${APPLY ? 'Готово.' : '[DRY-RUN] Ничего не записано. Запусти с --apply.'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
