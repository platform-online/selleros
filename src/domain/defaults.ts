import type { Business, Courier, Settings, Thresholds, ScalingGuardrails } from './types';

export const APP_NAME = 'SellerOS';
export const APP_VERSION = '1.0.0';

export const DEFAULT_THRESHOLDS: Thresholds = {
  changePct: 10,
  minOrders: 3,
  minPurchases: 15,
  minDays: 7,
  targetRoas: 3,
  maxCac: 0,
  returnRatePct: 15,
  healthyNetMarginPct: 12,
  healthyGrossMarginPct: 30,
  cashRunwayDays: 60,
  concentrationPct: 40,
  stockoutDays: 7,
  slowMoverDays: 45,
  deadStockDays: 90,
};

export const DEFAULT_GUARDRAILS: ScalingGuardrails = {
  minPurchases: 15,
  minDays: 7,
  targetRoas: 3,
  minContributionMarginPct: 10,
  maxCac: 0,
  maxReturnRatePct: 15,
  observationWindowDays: 14,
  /** default 20% — never recommend aggressive budget jumps (spec §66) */
  maxBudgetStepPct: 20,
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Marketing',
  'Advertising',
  'Packaging',
  'Transport',
  'Office',
  'Salary',
  'Freelancer',
  'Internet',
  'Mobile',
  'Rent',
  'Utilities',
  'Equipment',
  'Software',
  'Domain',
  'Hosting',
  'Email',
  'CDN',
  'SSL',
  'Maintenance',
  'Bank Fees',
  'Payment Gateway',
  'Tax',
  'VAT',
  'Customs',
  'Other',
];

export const DEFAULT_ORDER_CHANNELS = [
  'Website',
  'Facebook',
  'Instagram',
  'WhatsApp',
  'TikTok',
  'Marketplace',
  'Offline',
  'Other',
];

export const DEFAULT_PAYMENT_METHODS = [
  'COD',
  'Full Advance',
  'Partial Payment',
  'Delivery Charge Advance',
  'Cash',
  'bKash',
  'Nagad',
  'Rocket',
  'Bank',
  'Card',
  'Payment Gateway',
  'Other',
];

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Fashion',
  'Electronics',
  'Beauty',
  'Home',
  'Accessories',
  'Kids',
  'Health',
  'Other',
];

export const COURIER_PRESETS = [
  { name: 'Pathao', deliveryFee: 6000, codFee: 1000, codFeePct: 1, settlementDays: 3 },
  { name: 'Steadfast', deliveryFee: 6000, codFee: 1000, codFeePct: 1, settlementDays: 2 },
  { name: 'RedX', deliveryFee: 6500, codFee: 1500, codFeePct: 1.5, settlementDays: 3 },
  { name: 'CarryBee', deliveryFee: 7000, codFee: 1000, codFeePct: 1, settlementDays: 4 },
  { name: 'Sundarban', deliveryFee: 9000, codFee: 1500, codFeePct: 1.5, settlementDays: 5 },
  { name: 'Own Delivery', deliveryFee: 3000, codFee: 0, codFeePct: 0, settlementDays: 0 },
];

export const RETURN_REASONS = [
  'Customer refusal',
  'Size',
  'Quality',
  'Wrong product',
  'Changed mind',
  'Address',
  'Courier issue',
  'Other',
];

export const DEFAULT_BUSINESS: Business = {
  id: 'current',
  name: 'My Business',
  ownerName: '',
  phone: '',
  email: '',
  address: '',
  city: 'Dhaka',
  country: 'Bangladesh',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  logo: null,
  website: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  businessType: 'E-commerce',
  createdAt: new Date().toISOString(),
};

export function defaultSettings(): Settings {
  return {
    id: 'current',
    language: 'en',
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
    defaultPeriod: 'thisMonth',
    dashboardPreset: 'executive',
    widgets: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    guardrails: { ...DEFAULT_GUARDRAILS },
    openingCash: 0,
    attributionMethod: 'platform',
    appLock: { enabled: false, pin: null },
    productCategories: [...DEFAULT_PRODUCT_CATEGORIES],
    orderChannels: [...DEFAULT_ORDER_CHANNELS],
    paymentMethods: [...DEFAULT_PAYMENT_METHODS],
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
    courierPresets: COURIER_PRESETS.map((c) => c.name),
    schemaVersion: 1,
    appVersion: APP_VERSION,
    onboardingComplete: false,
  };
}

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'exchanged',
  'failed',
] as const;

export const PRODUCT_STATUSES = ['active', 'inactive', 'draft', 'archived'] as const;

export const GOOGLE_CAMPAIGN_TYPES = [
  'Search',
  'Shopping',
  'Performance Max',
  'Video',
  'Demand Gen',
  'App',
];

export const GOOGLE_NETWORKS = ['Search', 'Shopping', 'YouTube', 'Display', 'Discover', 'Gmail', 'Maps', 'Other'];

export const TIKTOK_CAMPAIGN_TYPES = ['Smart+', 'Manual', 'Catalog', 'Spark'];

export const TIKTOK_CREATIVE_TYPES = [
  'Video',
  'Post',
  'Image',
  'Carousel',
  'Catalog',
  'Catalog Video',
  'Catalog Carousel',
];

export const TIKTOK_ENHANCEMENTS = ['CTA', 'Add-ons', 'Other'];

export const META_CAMPAIGN_TYPES = [
  'Advantage+ Shopping',
  'Sales',
  'Leads',
  'Traffic',
  'Engagement',
  'Awareness',
  'App Promotion',
];

export const BUSINESS_TYPES = [
  'E-commerce',
  'F-commerce',
  'Marketplace Seller',
  'Retail',
  'Wholesale',
  'Services',
  'Other',
];

export const COUNTRIES = [
  'Bangladesh',
  'India',
  'Pakistan',
  'United Arab Emirates',
  'Saudi Arabia',
  'Malaysia',
  'United Kingdom',
  'United States',
  'Other',
];

export const TIMEZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'UTC',
];

export function courierTemplate(name: string): Omit<Courier, 'id' | 'createdAt'> {
  const preset = COURIER_PRESETS.find((c) => c.name === name);
  return {
    name,
    deliveryFee: preset?.deliveryFee ?? 6000,
    codFee: preset?.codFee ?? 1000,
    codFeePct: preset?.codFeePct ?? 1,
    settlementDays: preset?.settlementDays ?? 3,
    notes: '',
    active: true,
  };
}
