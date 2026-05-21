import {
  TrendingUp,
  Megaphone,
  Image,
  BarChart3,
  Truck,
  Wallet,
  Rocket,
  Store,
  ShoppingBag,
  Package,
  Globe,
  Boxes,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

/**
 * Render data for the onboarding wizard.
 * Keys are locked (match z.enum whitelists in onboarding tRPC router);
 * Russian labels are verbatim from 56-UI-SPEC Copywriting Contract.
 */

export interface GoalOption {
  key: 'SALES' | 'ADS' | 'CONTENT' | 'ANALYTICS' | 'OPERATIONS' | 'FINANCE' | 'NEW_MARKETPLACE';
  label: string;
  icon: LucideIcon;
}

export const GOAL_OPTIONS: GoalOption[] = [
  { key: 'SALES', label: 'Увеличить продажи', icon: TrendingUp },
  { key: 'ADS', label: 'Снизить расходы на рекламу', icon: Megaphone },
  { key: 'CONTENT', label: 'Улучшить карточки товара', icon: Image },
  { key: 'ANALYTICS', label: 'Разобраться в аналитике и нишах', icon: BarChart3 },
  { key: 'OPERATIONS', label: 'Навести порядок в операциях и логистике', icon: Truck },
  { key: 'FINANCE', label: 'Финансы и юнит-экономика', icon: Wallet },
  { key: 'NEW_MARKETPLACE', label: 'Выйти на новый маркетплейс', icon: Rocket },
];

export interface MarketplaceOption {
  key: 'WB' | 'OZON' | 'YANDEX' | 'ALIEXPRESS' | 'MEGAMARKET' | 'OWN_SHOP' | 'OTHER';
  label: string;
  icon: LucideIcon;
}

export const MARKETPLACE_OPTIONS: MarketplaceOption[] = [
  { key: 'WB', label: 'Wildberries', icon: ShoppingBag },
  { key: 'OZON', label: 'Ozon', icon: Package },
  { key: 'YANDEX', label: 'Яндекс Маркет', icon: Store },
  { key: 'ALIEXPRESS', label: 'AliExpress', icon: Globe },
  { key: 'MEGAMARKET', label: 'Мегамаркет', icon: Boxes },
  { key: 'OWN_SHOP', label: 'Свой интернет-магазин', icon: Store },
  { key: 'OTHER', label: 'Другое', icon: MoreHorizontal },
];

export interface ExperienceOption {
  key: 'PROSPECTING' | 'BEGINNER' | 'STABLE' | 'ADVANCED';
  title: string;
  description: string;
}

export const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  { key: 'PROSPECTING', title: 'Только присматриваюсь', description: 'Ещё не продаю' },
  { key: 'BEGINNER', title: 'Новичок', description: 'Продаю недавно, небольшой оборот' },
  { key: 'STABLE', title: 'Есть стабильные продажи', description: 'Уверенно работаю на маркетплейсах' },
  { key: 'ADVANCED', title: 'Опытный селлер', description: 'Уверенно масштабируюсь' },
];
