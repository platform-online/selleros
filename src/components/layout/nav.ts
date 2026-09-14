import type { TranslationKey } from '../../i18n/en';

export interface NavItem {
  path: string;
  labelKey: TranslationKey;
  icon:
    | 'home'
    | 'chart'
    | 'cart'
    | 'box'
    | 'warehouse'
    | 'users'
    | 'truck'
    | 'handshake'
    | 'megaphone'
    | 'wallet'
    | 'spark'
    | 'report'
    | 'file'
    | 'settings';
  mobile?: boolean;
}

/** Desktop sidebar. Mobile bottom bar shows the `mobile` subset + More. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.home', icon: 'home', mobile: true },
  { path: '/sales', labelKey: 'nav.sales', icon: 'chart' },
  { path: '/orders', labelKey: 'nav.orders', icon: 'cart', mobile: true },
  { path: '/products', labelKey: 'nav.products', icon: 'box', mobile: true },
  { path: '/inventory', labelKey: 'nav.inventory', icon: 'warehouse' },
  { path: '/customers', labelKey: 'nav.customers', icon: 'users' },
  { path: '/suppliers', labelKey: 'nav.suppliers', icon: 'handshake' },
  { path: '/couriers', labelKey: 'nav.couriers', icon: 'truck' },
  { path: '/ads', labelKey: 'nav.ads', icon: 'megaphone' },
  { path: '/finance', labelKey: 'nav.finance', icon: 'wallet', mobile: true },
  { path: '/insights', labelKey: 'nav.insights', icon: 'spark' },
  { path: '/reports', labelKey: 'nav.reports', icon: 'report' },
  { path: '/documents', labelKey: 'nav.documents', icon: 'file' },
  { path: '/settings', labelKey: 'nav.settings', icon: 'settings' },
];

export interface ActionDef {
  id: string;
  labelKey: TranslationKey;
  /** route to open, or an intent handled by the palette host */
  to?: string;
  intent?:
    | 'newProduct'
    | 'newOrder'
    | 'newExpense'
    | 'newPurchase'
    | 'newCustomer'
    | 'newSupplier'
    | 'newReturn'
    | 'export'
    | 'backup'
    | 'import';
}

export const COMMAND_ACTIONS: ActionDef[] = [
  { id: 'newProduct', labelKey: 'products.new', intent: 'newProduct' },
  { id: 'newOrder', labelKey: 'orders.new', intent: 'newOrder' },
  { id: 'newExpense', labelKey: 'expenses.new', intent: 'newExpense' },
  { id: 'newPurchase', labelKey: 'purchases.new', intent: 'newPurchase' },
  { id: 'newCustomer', labelKey: 'customers.new', intent: 'newCustomer' },
  { id: 'newSupplier', labelKey: 'suppliers.new', intent: 'newSupplier' },
  { id: 'newReturn', labelKey: 'returns.new', intent: 'newReturn' },
  { id: 'openFinance', labelKey: 'nav.finance', to: '/finance' },
  { id: 'openAds', labelKey: 'nav.ads', to: '/ads' },
  { id: 'openInsights', labelKey: 'nav.insights', to: '/insights' },
  { id: 'export', labelKey: 'action.export', intent: 'export' },
  { id: 'backup', labelKey: 'action.backup', intent: 'backup' },
  { id: 'import', labelKey: 'action.import', intent: 'import' },
  { id: 'settings', labelKey: 'nav.settings', to: '/settings' },
];
