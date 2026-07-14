/**
 * CloudPayments widget wrapper (new API — widget.start())
 * Docs: docs/cloudpayments-api-2026-03-12.md
 * Loads via <script src="https://widget.cloudpayments.ru/bundles/cloudpayments">
 */

import type { CustomerReceipt } from './types';

interface WidgetResult {
  type: string;
  status: string;
  data?: Record<string, unknown>;
  message?: string;
}

interface CloudPaymentsWidget {
  start(intentParams: Record<string, unknown>): Promise<WidgetResult>;
  oncomplete?: (result: WidgetResult) => void;
}

interface CloudPaymentsConstructor {
  new (): CloudPaymentsWidget;
}

declare global {
  interface Window {
    cp?: {
      CloudPayments: CloudPaymentsConstructor;
    };
  }
}

export interface CPChargeOptions {
  publicId: string;
  description: string;
  amount: number;
  currency?: string;
  accountId: string;
  invoiceId: string;
  email?: string;
  recurrent?: {
    interval: 'Month' | 'Week' | 'Day';
    period: number;
    amount?: number;
    /**
     * ISO-8601 date of the FIRST recurring charge (CP "Дата первого списания").
     * Used to stack the paid period after an active trial: the immediate
     * payment covers up to this date, and CP auto-charges only from here.
     * When omitted, CP defaults to paymentDate + interval.
     */
    startDate?: string;
    /**
     * 54-FZ receipt template for the auto-charge. May differ from the root
     * `receipt` when the first payment is discounted but the recurrent charges
     * the full plan price. When omitted, falls back to the root `receipt`.
     */
    receipt?: CustomerReceipt;
  };
  /**
   * 54-FZ receipt. Passed both at intent root (first payment) AND inside
   * `recurrent.receipt` as a template for auto-charges — CP fires recurrents
   * with CustomerReceipt:null when this template is missing.
   */
  receipt?: CustomerReceipt;
}

/**
 * Open CloudPayments payment widget.
 * Resolves true on successful payment, false on failure/cancel.
 */
export function openPaymentWidget(options: CPChargeOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.cp) {
      console.error('CloudPayments widget not loaded');
      resolve(false);
      return;
    }

    const widget = new window.cp.CloudPayments();

    const intentParams: Record<string, unknown> = {
      publicTerminalId: options.publicId,
      description: options.description,
      amount: options.amount,
      currency: options.currency ?? 'RUB',
      paymentSchema: 'Single',
      externalId: options.invoiceId,
      retryPayment: true,
      userInfo: {
        accountId: options.accountId,
        ...(options.email ? { email: options.email } : {}),
      },
      // Defensive: also pass our subscription id via the freeform `data` field
      // so the webhook always has it, even if CP's externalId→InvoiceId mapping
      // breaks for subscription/recurrent flows. parse-webhook.ts reads this.
      data: { ourSubscriptionId: options.invoiceId },
    };

    if (options.receipt) {
      intentParams.receipt = options.receipt;
    }

    if (options.recurrent) {
      const recurrentReceipt = options.recurrent.receipt ?? options.receipt;
      intentParams.recurrent = {
        interval: options.recurrent.interval,
        period: options.recurrent.period,
        amount: options.recurrent.amount ?? options.amount,
        ...(options.recurrent.startDate
          ? { startDate: options.recurrent.startDate }
          : {}),
        ...(recurrentReceipt ? { receipt: recurrentReceipt } : {}),
      };
    }

    widget
      .start(intentParams)
      .then((result) => {
        resolve(result.status === 'success');
      })
      .catch(() => {
        resolve(false);
      });
  });
}
