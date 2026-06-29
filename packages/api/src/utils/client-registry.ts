/**
 * Sales client registry: one row per registered user with contact, acquisition
 * source, and payment status — assembled from our own DB (CloudPayments data is
 * mirrored into Payment/PaymentEvent by the webhook; checkout reach into
 * CheckoutAttempt). Pure + DB-agnostic so it can be unit-tested; the procedure
 * and the CSV export both feed it the same fetched rows.
 *
 * Payment status precedence per user: paid > failed > checkout > none.
 */

export type PaymentStatusBucket = 'paid' | 'failed' | 'checkout' | 'none';

export interface RegistryUser {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  createdAt: Date;
}

export interface RegistrySource {
  /** ambassador code (with label), peer user-referral, or organic. */
  referredUserId: string;
  type: 'ambassador' | 'referral';
  label: string; // ambassador code label, or referrer name
}

export interface RegistryPayment {
  userId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  amount: number;
  paidAt: Date | null;
  planName: string | null;
}

export interface RegistryInput {
  users: RegistryUser[];
  sources: RegistrySource[];
  payments: RegistryPayment[];
  /** userIds that reached the payment widget (CheckoutAttempt). */
  checkoutUserIds: string[];
}

export interface RegistryRow {
  userId: string;
  email: string;
  name: string;
  phone: string;
  registeredAt: string; // ISO
  source: string; // human label: «Амбассадор: X» / «Реферал: Y» / «Органика»
  paymentStatus: PaymentStatusBucket;
  paymentStatusLabel: string;
  lastPaidAt: string | null; // ISO
  lastPaidAmount: number | null;
  plan: string;
}

const STATUS_LABELS: Record<PaymentStatusBucket, string> = {
  paid: 'Оплатил',
  failed: 'Неудачная попытка',
  checkout: 'Открывал оплату',
  none: 'Без попыток',
};

export function assembleClientRegistry(input: RegistryInput): RegistryRow[] {
  // One source per user — Referral.referredUserId is @unique, so no real
  // duplicates; the Map collapses any legacy dupes to the last entry.
  const sourceByUser = new Map(input.sources.map((s) => [s.referredUserId, s]));
  const checkoutSet = new Set(input.checkoutUserIds);

  // Group payments by user.
  const payByUser = new Map<string, RegistryPayment[]>();
  for (const p of input.payments) {
    if (!payByUser.has(p.userId)) payByUser.set(p.userId, []);
    payByUser.get(p.userId)!.push(p);
  }

  return input.users.map((u) => {
    const src = sourceByUser.get(u.id);
    const source = src
      ? src.type === 'ambassador'
        ? `Амбассадор: ${src.label}`
        : `Реферал: ${src.label}`
      : 'Органика';

    const pays = payByUser.get(u.id) ?? [];
    const completed = pays.filter((p) => p.status === 'COMPLETED');

    let status: PaymentStatusBucket;
    let lastPaidAt: string | null = null;
    let lastPaidAmount: number | null = null;
    let plan = '';

    if (completed.length > 0) {
      status = 'paid';
      // Latest successful payment by paidAt (fallback: keep first).
      const latest = completed.reduce((a, b) =>
        (b.paidAt?.getTime() ?? 0) > (a.paidAt?.getTime() ?? 0) ? b : a,
      );
      lastPaidAt = latest.paidAt ? latest.paidAt.toISOString() : null;
      lastPaidAmount = latest.amount;
      plan = latest.planName ?? '';
    } else if (pays.some((p) => p.status === 'FAILED' || p.status === 'REFUNDED')) {
      status = 'failed';
    } else if (checkoutSet.has(u.id) || pays.some((p) => p.status === 'PENDING')) {
      status = 'checkout';
    } else {
      status = 'none';
    }

    return {
      userId: u.id,
      email: u.email ?? '',
      name: u.name ?? '',
      phone: u.phone ?? '',
      registeredAt: u.createdAt.toISOString(),
      source,
      paymentStatus: status,
      paymentStatusLabel: STATUS_LABELS[status],
      lastPaidAt,
      lastPaidAmount,
      plan,
    };
  });
}

const CSV_COLUMNS: Array<{ key: keyof RegistryRow; header: string }> = [
  { key: 'email', header: 'Email' },
  { key: 'name', header: 'Имя' },
  { key: 'phone', header: 'Телефон' },
  { key: 'registeredAt', header: 'Дата регистрации' },
  { key: 'source', header: 'Источник' },
  { key: 'paymentStatusLabel', header: 'Статус оплаты' },
  { key: 'lastPaidAt', header: 'Дата оплаты' },
  { key: 'lastPaidAmount', header: 'Сумма' },
  { key: 'plan', header: 'Тариф' },
];

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Escape per RFC 4180: wrap in quotes if it contains comma/quote/newline.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize registry rows to CSV. Prepends a UTF-8 BOM so Excel reads Cyrillic. */
export function toRegistryCsv(rows: RegistryRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(',');
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c.key])).join(',')).join('\r\n');
  return `﻿${header}\r\n${body}`;
}
