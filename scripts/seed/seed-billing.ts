/**
 * Seed script: billing data foundation
 *
 * Creates:
 * - Feature flags (billing_enabled=false, maintenance_mode=false)
 * - Subscription plans (COURSE 1990 [isActive=false, legacy], PLATFORM 2990/30d,
 *   PLATFORM 7990/90d, PLATFORM 13990/180d — Тарифы 2.0 мультимесяц)
 * - Updates all courses to price=2990 isFree=false
 *
 * Run:
 *   npx tsx scripts/seed/seed-billing.ts
 *   pnpm db:seed-billing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding billing data...\n');

  // 1. Feature flags
  const billingFlag = await prisma.featureFlag.upsert({
    where: { key: 'billing_enabled' },
    update: {},
    create: {
      key: 'billing_enabled',
      enabled: false,
      description: 'Enable billing and subscription features',
    },
  });
  console.log(`Feature flag: ${billingFlag.key} = ${billingFlag.enabled}`);

  const maintenanceFlag = await prisma.featureFlag.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: {
      key: 'maintenance_mode',
      enabled: false,
      description: 'Show maintenance page to non-admin users',
    },
  });
  console.log(`Feature flag: ${maintenanceFlag.key} = ${maintenanceFlag.enabled}`);

  // 2. Subscription plans — @unique on type was dropped to support hidden
  // test plans AND multiple PLATFORM tiers (Тарифы 2.0: 30/90/180 дней).
  // Upsert by the composite (type, intervalDays) — NOT findFirst({type,hidden}),
  // which would collide across the 3 non-hidden PLATFORM rows and keep
  // updating whichever row it found first instead of creating distinct ones.
  const seedPlan = async (
    type: 'COURSE' | 'PLATFORM',
    name: string,
    price: number,
    intervalDays: number,
    options: { hidden?: boolean; isActive?: boolean } = {},
  ) => {
    const { hidden = false, isActive = true } = options;
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { type, intervalDays, hidden },
    });
    if (existing) {
      return prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: { price, name, isActive },
      });
    }
    return prisma.subscriptionPlan.create({
      data: { type, name, price, intervalDays, hidden, isActive },
    });
  };

  // COURSE — легаси, снесён из пути покупки (Тарифы 2.0). Локальный seed
  // держит isActive=false с самого начала (прод COURSE флипается отдельно,
  // Task 1b, после деплоя нового кода — см. migrate-pricing-2.0-plans.ts).
  const coursePlan = await seedPlan('COURSE', 'Подписка на курс', 1990, 30, {
    isActive: false,
  });
  console.log(`Plan: ${coursePlan.name} — ${coursePlan.price} руб. (isActive=${coursePlan.isActive})`);

  const platformPlan = await seedPlan('PLATFORM', 'Полный доступ', 2990, 30);
  console.log(`Plan: ${platformPlan.name} — ${platformPlan.price} руб.`);

  const platform3m = await seedPlan(
    'PLATFORM',
    'Полный доступ — 3 месяца',
    7990,
    90,
  );
  console.log(`Plan: ${platform3m.name} — ${platform3m.price} руб.`);

  const platform6m = await seedPlan(
    'PLATFORM',
    'Полный доступ — 6 месяцев',
    13990,
    180,
  );
  console.log(`Plan: ${platform6m.name} — ${platform6m.price} руб.`);

  // 3. Update all courses: set price=2990, isFree=false
  const updateResult = await prisma.course.updateMany({
    data: {
      price: 2990,
      isFree: false,
    },
  });
  console.log(`\nCourses updated: ${updateResult.count} (price=2990, isFree=false)`);

  console.log('\nBilling seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
