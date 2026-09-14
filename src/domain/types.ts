/**
 * SellerOS domain model.
 *
 * Every monetary field is a `Money` value (integer minor units). Every record
 * that participates in period reporting carries a business `date` (YYYY-MM-DD
 * in the workspace timezone). Stock is never stored on the product — it is
 * derived from `InventoryMovement`, which makes resets and recalculations safe.
 */
import type { Money } from '../lib/money';
import type { Language } from '../lib/format';
import type { PeriodKey } from '../lib/dates';

export type ID = string;
export type ISODate = string; // YYYY-MM-DD

/* ------------------------------------------------------------------ *
 * Workspace
 * ------------------------------------------------------------------ */

export interface Business {
  id: 'current';
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  timezone: string;
  logo: string | null;
  website: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  businessType: string;
  createdAt: string;
}

export interface Thresholds {
  /** relative change (%) that makes a metric "moving" */
  changePct: number;
  /** minimum orders in a period before we comment on a product/campaign */
  minOrders: number;
  /** minimum ad purchases before a SCALE/PAUSE recommendation */
  minPurchases: number;
  /** minimum days of ad data before a decision */
  minDays: number;
  /** user's target ROAS */
  targetRoas: number;
  /** maximum acceptable CAC (major units, 0 = unset) */
  maxCac: number;
  /** return rate (%) that triggers an alert */
  returnRatePct: number;
  /** net margin (%) considered healthy */
  healthyNetMarginPct: number;
  /** gross margin (%) considered healthy */
  healthyGrossMarginPct: number;
  /** days of cash on hand considered safe */
  cashRunwayDays: number;
  /** share of revenue from one product/customer that is "concentrated" */
  concentrationPct: number;
  /** days of stock below which a product is at stockout risk */
  stockoutDays: number;
  /** days without sales after which stock is "slow" */
  slowMoverDays: number;
  /** days without sales after which stock is "dead" */
  deadStockDays: number;
}

export interface ScalingGuardrails {
  minPurchases: number;
  minDays: number;
  targetRoas: number;
  minContributionMarginPct: number;
  maxCac: number;
  maxReturnRatePct: number;
  observationWindowDays: number;
  /** default 20% — never recommend aggressive budget jumps */
  maxBudgetStepPct: number;
}

export type WidgetPreset =
  | 'executive'
  | 'finance'
  | 'sales'
  | 'ads'
  | 'operations'
  | 'minimal';

export interface WidgetPref {
  id: string;
  visible: boolean;
  order: number;
  size: 'sm' | 'md' | 'lg';
  period?: PeriodKey;
}

export interface Settings {
  id: 'current';
  language: Language;
  currency: string;
  timezone: string;
  defaultPeriod: PeriodKey;
  dashboardPreset: WidgetPreset;
  widgets: WidgetPref[];
  thresholds: Thresholds;
  guardrails: ScalingGuardrails;
  /** opening cash balance of the workspace (minor units) */
  openingCash: Money;
  attributionMethod: AttributionMethod;
  /** optional, explicitly non-blocking privacy lock */
  appLock: { enabled: boolean; pin: string | null };
  productCategories: string[];
  orderChannels: string[];
  paymentMethods: string[];
  expenseCategories: string[];
  courierPresets: string[];
  schemaVersion: number;
  appVersion: string;
  onboardingComplete: boolean;
}

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

export type ProductStatus = 'active' | 'inactive' | 'draft' | 'archived';

/** How the direct-cost bucket is interpreted when computing landed cost. */
export type CostBasis = 'perUnit' | 'batch' | 'percentOfBuying';

export interface DirectCosts {
  importDuty: Money;
  freight: Money;
  customs: Money;
  handling: Money;
  packaging: Money;
  label: Money;
  other: Money;
}

export interface Product {
  id: ID;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  supplierId: ID | null;
  description: string;
  tags: string[];
  status: ProductStatus;
  image: string | null;
  notes: string;

  sellingPrice: Money;
  buyingPrice: Money;
  compareAtPrice: Money;
  discountPct: number;
  minSellingPrice: Money;
  targetMarginPct: number;
  targetProfit: Money;

  reorderLevel: number;
  reorderQuantity: number;
  safetyStock: number;

  weightKg: number;
  packageWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;

  costs: DirectCosts;
  costBasis: CostBasis;
  /** units the direct-cost bucket covers when costBasis === 'batch' */
  batchQty: number;

  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'return'
  | 'damage'
  | 'adjustment'
  | 'transfer'
  | 'correction';

export interface InventoryMovement {
  id: ID;
  productId: ID;
  type: MovementType;
  /** signed: positive = stock in, negative = stock out */
  qty: number;
  date: ISODate;
  unitCost: Money | null;
  refType: string | null;
  refId: ID | null;
  note: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Purchasing
 * ------------------------------------------------------------------ */

export type PurchaseStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchasePayment {
  id: ID;
  date: ISODate;
  amount: Money;
  method: string;
}

export interface Purchase {
  id: ID;
  ref: string;
  supplierId: ID | null;
  date: ISODate;
  expectedDate: ISODate | null;
  receivedDate: ISODate | null;
  status: PurchaseStatus;
  note: string;
  payments: PurchasePayment[];
  additionalCosts: DirectCosts;
  createdAt: string;
}

export interface PurchaseItem {
  id: ID;
  purchaseId: ID;
  productId: ID;
  qty: number;
  receivedQty: number;
  buyingPrice: Money;
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export interface Supplier {
  id: ID;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  source: string;
  tags: string[];
  createdAt: ISODate;
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'exchanged'
  | 'failed';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export type AttributionMethod = 'last-touch' | 'first-touch' | 'platform' | 'manual';

export interface OrderAttribution {
  platform: string;
  campaign: string;
  adset: string;
  ad: string;
  creative: string;
  productId: ID | null;
  source: string;
  medium: string;
  campaignId: string;
  method: AttributionMethod;
}

export interface Order {
  id: ID;
  orderNo: string;
  date: ISODate;
  customerId: ID | null;
  channel: string;
  courierId: ID | null;
  trackingId: string;
  notes: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** discount applied at order level (minor units) */
  discount: Money;
  /** delivery charge collected from the customer (revenue side) */
  shippingCharged: Money;
  /** delivery fee actually paid to the courier */
  deliveryFee: Money;
  codFee: Money;
  packagingCost: Money;
  paymentFee: Money;
  otherCost: Money;
  /** ad spend attributed to this order (manual or platform-reported) */
  adSpend: Money;
  attribution: OrderAttribution;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: ID;
  orderId: ID;
  productId: ID;
  qty: number;
  unitPrice: Money;
  /** line-level discount in minor units */
  discount: Money;
  /** true unit cost captured at the moment of sale (COGS snapshot) */
  unitCost: Money;
}

export type PaymentType = 'in' | 'refund' | 'settlement';

export interface Payment {
  id: ID;
  orderId: ID;
  date: ISODate;
  method: string;
  type: PaymentType;
  amount: Money;
  note: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Fulfilment
 * ------------------------------------------------------------------ */

export interface Courier {
  id: ID;
  name: string;
  deliveryFee: Money;
  codFee: Money;
  codFeePct: number;
  settlementDays: number;
  notes: string;
  active: boolean;
  createdAt: string;
}

export type ReturnCondition = 'resellable' | 'damaged' | 'lost';

export interface ReturnRecord {
  id: ID;
  orderId: ID;
  productId: ID;
  qty: number;
  date: ISODate;
  reason: string;
  courierId: ID | null;
  /** cash paid to the courier to bring the parcel back */
  returnFee: Money;
  /** cash refunded to the customer */
  refund: Money;
  /** packaging that cannot be reused */
  packagingLoss: Money;
  /** ad spend allocated to the returned unit */
  adAllocation: Money;
  condition: ReturnCondition;
  resellable: boolean;
  note: string;
  createdAt: string;
}

export interface Damage {
  id: ID;
  productId: ID;
  qty: number;
  date: ISODate;
  reason: string;
  /** unit cost written off (minor units) */
  unitCost: Money;
  recoverable: boolean;
  /** cash recovered (scrap/insurance) */
  recoveredAmount: Money;
  note: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

export interface Expense {
  id: ID;
  date: ISODate;
  category: string;
  amount: Money;
  vendor: string;
  note: string;
  method: string;
  /** link to the recurring definition that generated it (paid, not auto) */
  recurringId: ID | null;
  createdAt: string;
}

export type Cycle = 'monthly' | 'yearly' | 'custom';

/**
 * A recurring expense is a *reminder*, never an automatic ledger entry.
 * It enters the books only when the user records the actual payment.
 */
export interface RecurringExpense {
  id: ID;
  name: string;
  category: string;
  amount: Money;
  cycle: Cycle;
  /** used when cycle === 'custom' */
  intervalDays: number;
  nextDue: ISODate;
  renewalType: string;
  note: string;
  active: boolean;
  createdAt: string;
}

/** User-entered ledger lines that have no other source record. */
export interface ManualLedgerEntry {
  id: ID;
  date: ISODate;
  direction: 'in' | 'out';
  category: string;
  amount: Money;
  note: string;
  createdAt: string;
}

/**
 * Derived cash-ledger projection. Rebuilt deterministically from source
 * records so orphan entries are structurally impossible.
 */
export interface LedgerEntry {
  id: string;
  date: ISODate;
  direction: 'in' | 'out';
  category: string;
  label: string;
  amount: Money;
  refType: string;
  refId: ID;
}

/* ------------------------------------------------------------------ *
 * Advertising
 * ------------------------------------------------------------------ */

export type AdPlatform = 'meta' | 'google' | 'tiktok' | 'other';

/**
 * One reporting row from an ad platform export (or manual entry).
 * Dimensions are optional on purpose: Meta exposes ad-set rows, Google exposes
 * product/channel rows, TikTok Smart+ exposes creative × text × enhancement
 * combinations. The model never assumes a dimension is present.
 */
export interface AdRow {
  id: ID;
  date: ISODate;
  platform: AdPlatform;
  account: string;
  campaign: string;
  campaignType: string;
  campaignId: string;
  adset: string;
  ad: string;
  creative: string;
  creativeType: string;
  text: string;
  enhancement: string;
  placement: string;
  network: string;
  productId: ID | null;
  sku: string;

  spend: Money;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  destinationClicks: number;
  landingViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  conversions: number;
  conversionValue: Money;
  revenue: Money;
  videoViews: number;
  videoWatched25: number;
  videoWatched50: number;
  videoWatched75: number;
  videoWatched100: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Goals, audit, notifications
 * ------------------------------------------------------------------ */

export type GoalMetric =
  | 'revenue'
  | 'profit'
  | 'orders'
  | 'netMarginPct'
  | 'roas'
  | 'cac'
  | 'aov'
  | 'customers';

export interface Goal {
  id: ID;
  metric: GoalMetric;
  target: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  note: string;
  active: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: ID;
  at: string;
  entity: string;
  entityId: ID;
  label: string;
  field: string;
  before: string;
  after: string;
}

export type NotificationAction = 'dismissed' | 'done' | 'snoozed';

export interface NotificationState {
  /** stable fingerprint of the underlying condition */
  id: string;
  action: NotificationAction;
  updatedAt: string;
  snoozedUntil: ISODate | null;
}
