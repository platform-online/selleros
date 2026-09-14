/**
 * FINANCIAL ENGINE
 * ================
 * Every money figure in SellerOS — dashboard tiles, P&L, product profit,
 * order economics, ad profit, reports — is produced here. UI components never
 * implement their own arithmetic; they render the results.
 *
 * Chain:  Buying Price → Landed Cost → True Unit Cost → COGS
 *         → Gross Profit → Contribution Profit → Net Operating Profit
 *
 * Money is integer minor units (see lib/money). Ratios use `ratio()` so a
 * zero denominator yields `null` ("—") rather than Infinity.
 */
import { add, money, ratio, roundMinor, sub, sum, type Money } from '../lib/money';
import type {
  AdRow,
  Courier,
  Damage,
  DirectCosts,
  Expense,
  InventoryMovement,
  LedgerEntry,
  ManualLedgerEntry,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  ReturnRecord,
} from './types';

/* ------------------------------------------------------------------ *
 * 1. Cost engine
 * ------------------------------------------------------------------ */

export const EMPTY_DIRECT_COSTS: DirectCosts = {
  importDuty: 0,
  freight: 0,
  customs: 0,
  handling: 0,
  packaging: 0,
  label: 0,
  other: 0,
};

export const DIRECT_COST_KEYS = (Object.keys(EMPTY_DIRECT_COSTS) as (keyof DirectCosts)[]);

/** Sum of a direct-cost bucket. */
export function directCostTotal(costs: Partial<DirectCosts> | undefined): Money {
  if (!costs) return 0;
  return add(...DIRECT_COST_KEYS.map((k) => costs[k] ?? 0));
}

/**
 * Direct cost **per unit** for a product, honouring the chosen allocation basis:
 *  - perUnit          → values already per unit
 *  - batch            → values cover `batchQty` units (batch costs / units)
 *  - percentOfBuying  → values are percentages of the buying price
 */
export function directCostPerUnit(product: Pick<Product, 'costs' | 'costBasis' | 'batchQty' | 'buyingPrice'>): Money {
  const costs = product.costs ?? EMPTY_DIRECT_COSTS;
  switch (product.costBasis) {
    case 'batch': {
      const qty = product.batchQty > 0 ? product.batchQty : 1;
      return roundMinor(directCostTotal(costs) / qty);
    }
    case 'percentOfBuying': {
      // Stored values are percent points of the buying price (10 => 10%).
      const pct = directCostTotal(costs);
      return roundMinor((product.buyingPrice * pct) / 100);
    }
    case 'perUnit':
    default:
      return directCostTotal(costs);
  }
}

/** Landed cost = buying price + all direct costs. */
export function landedCost(product: Pick<Product, 'costs' | 'costBasis' | 'batchQty' | 'buyingPrice'>): Money {
  return add(product.buyingPrice ?? 0, directCostPerUnit(product));
}

/**
 * True unit cost.
 * `purchaseUnitCost` (batch cost from an actual purchase, including allocated
 * additional costs) wins when supplied, because it reflects what was really
 * paid rather than the catalogue price.
 */
export function trueUnitCost(
  product: Pick<Product, 'costs' | 'costBasis' | 'batchQty' | 'buyingPrice'>,
  purchaseUnitCost: Money | null = null,
): Money {
  if (purchaseUnitCost !== null && purchaseUnitCost > 0) return purchaseUnitCost;
  return landedCost(product);
}

/** Per-unit direct-cost breakdown (for the cost-breakdown panel). */
export function costBreakdown(product: Product): { label: keyof DirectCosts | 'buying'; amount: Money }[] {
  const perUnit = directCostPerUnit(product);
  const total = directCostTotal(product.costs);
  const scale = total > 0 ? ratio(perUnit, total) ?? 0 : 0;
  const parts = DIRECT_COST_KEYS.map((k) => ({
    label: k,
    amount: roundMinor((product.costs?.[k] ?? 0) * scale),
  })).filter((p) => p.amount !== 0);
  // reconcile rounding drift against the authoritative per-unit figure
  const drift = sub(perUnit, sum(parts.map((p) => p.amount)));
  if (drift !== 0 && parts.length > 0) parts[parts.length - 1].amount += drift;
  return [{ label: 'buying', amount: product.buyingPrice }, ...parts];
}

/* ------------------------------------------------------------------ *
 * 2. Inventory
 * ------------------------------------------------------------------ */

export interface StockPosition {
  productId: string;
  totalIn: number;
  totalOut: number;
  onHand: number;
  /** units reserved by orders that are not yet delivered */
  reserved: number;
  available: number;
  inventoryValue: Money;
  unitCost: Money;
}

/**
 * Derive on-hand stock from movements.
 * Stock is never stored, so a reset that deletes movements cannot leave a
 * product showing phantom inventory.
 */
export function stockFromMovements(
  productId: string,
  movements: readonly InventoryMovement[],
  unitCost: Money,
): StockPosition {
  let totalIn = 0;
  let totalOut = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    if (m.qty >= 0) totalIn += m.qty;
    else totalOut += -m.qty;
  }
  const onHand = totalIn - totalOut;
  return {
    productId,
    totalIn,
    totalOut,
    onHand,
    reserved: 0,
    available: onHand,
    inventoryValue: roundMinor(onHand * unitCost),
    unitCost,
  };
}

/** Reserved units = units in orders that are neither delivered, cancelled, failed nor returned. */
export const OPEN_ORDER_STATUSES: Order['status'][] = ['pending', 'confirmed', 'packed', 'shipped'];

export function reservedUnits(orderItems: readonly OrderItem[], orders: readonly Order[]): Map<string, number> {
  const statusById = new Map(orders.map((o) => [o.id, o.status]));
  const out = new Map<string, number>();
  for (const item of orderItems) {
    const status = statusById.get(item.orderId);
    if (!status || !OPEN_ORDER_STATUSES.includes(status)) continue;
    out.set(item.productId, (out.get(item.productId) ?? 0) + item.qty);
  }
  return out;
}

/** Stock turnover = units sold / average stock. Null when average stock is 0. */
export function stockTurnover(unitsSold: number, averageStock: number): number | null {
  return averageStock > 0 ? ratio(unitsSold, averageStock) : null;
}

/** Days of stock left at the current sell rate. Null when nothing is selling. */
export function daysOfStock(onHand: number, unitsSold: number, periodDays: number): number | null {
  if (periodDays <= 0) return null;
  const rate = unitsSold / periodDays;
  if (rate <= 0) return null;
  return onHand / rate;
}

/* ------------------------------------------------------------------ *
 * 3. Order economics
 * ------------------------------------------------------------------ */

export interface OrderEconomics {
  orderId: string;
  grossRevenue: Money;
  discounts: Money;
  shippingIncome: Money;
  netRevenue: Money;
  cogs: Money;
  packaging: Money;
  courier: Money;
  paymentFee: Money;
  adSpend: Money;
  returnCost: Money;
  damageCost: Money;
  otherVariable: Money;
  contributionProfit: Money;
  operatingAllocation: Money;
  netProfit: Money;
  units: number;
  grossProfit: Money;
  grossMarginPct: number | null;
  contributionMarginPct: number | null;
  netMarginPct: number | null;
  /** where each cost line came from, for the drill-down UI */
  sources: Record<string, string>;
}

export interface OrderEconomicsOptions {
  productById: Map<string, Product>;
  courierById: Map<string, Courier>;
  /** cash return cost per order (see `returnCashCost`) */
  returnCostByOrder?: Map<string, Money>;
  /** damage cost allocated to the order, if any */
  damageCostByOrder?: Map<string, Money>;
  /** explicit ad spend; when absent the caller may pass an allocated estimate */
  adSpendByOrder?: Map<string, Money>;
  /** total operating expense to allocate across orders by net-revenue share */
  operatingCost?: Money;
  /** total net revenue used as the allocation denominator */
  operatingCostBase?: Money;
}

/**
 * Per-order economics (spec §32). Profit is NEVER selling price − buying price:
 * fulfilment, packaging, payment, ad and return costs all count.
 */
export function orderEconomics(
  order: Order,
  items: readonly OrderItem[],
  opts: OrderEconomicsOptions,
): OrderEconomics {
  const lineItems = items.filter((i) => i.orderId === order.id);

  const grossRevenue = sum(lineItems.map((i) => roundMinor(i.unitPrice * i.qty)));
  const itemDiscounts = sum(lineItems.map((i) => i.discount ?? 0));
  const discounts = add(order.discount ?? 0, itemDiscounts);
  const shippingIncome = order.shippingCharged ?? 0;
  const netRevenue = sub(grossRevenue, discounts) + shippingIncome;

  const cogs = sum(lineItems.map((i) => roundMinor((i.unitCost ?? 0) * i.qty)));
  const units = lineItems.reduce((acc, i) => acc + i.qty, 0);

  const sources: Record<string, string> = {};

  // Packaging: explicit order value wins, otherwise per-unit product packaging.
  let packaging = order.packagingCost ?? 0;
  if (packaging === 0) {
    packaging = sum(
      lineItems.map((i) => {
        const p = opts.productById.get(i.productId);
        if (!p) return 0;
        return roundMinor((p.costs?.packaging ?? 0) * i.qty);
      }),
    );
    if (packaging > 0) sources.packaging = 'derived';
  } else {
    sources.packaging = 'order';
  }

  // Courier: explicit fees win, otherwise the courier's published rates.
  let courier = add(order.deliveryFee ?? 0, order.codFee ?? 0);
  if (courier === 0 && order.courierId) {
    const c = opts.courierById.get(order.courierId);
    if (c) {
      courier = add(c.deliveryFee, roundMinor(netRevenue * (c.codFeePct / 100)), c.codFee);
      sources.courier = 'derived';
    }
  } else if (courier > 0) {
    sources.courier = 'order';
  }

  const paymentFee = order.paymentFee ?? 0;
  const adSpend = opts.adSpendByOrder?.get(order.id) ?? order.adSpend ?? 0;
  const returnCost = opts.returnCostByOrder?.get(order.id) ?? 0;
  const damageCost = opts.damageCostByOrder?.get(order.id) ?? 0;
  const otherVariable = order.otherCost ?? 0;

  const grossProfit = sub(netRevenue, cogs);
  const contributionProfit = sub(
    netRevenue,
    cogs,
    packaging,
    courier,
    paymentFee,
    adSpend,
    returnCost,
    damageCost,
    otherVariable,
  );

  const base = opts.operatingCostBase ?? 0;
  const operatingAllocation = base > 0 ? roundMinor(((opts.operatingCost ?? 0) * netRevenue) / base) : 0;
  const netProfit = sub(contributionProfit, operatingAllocation);

  return {
    orderId: order.id,
    grossRevenue,
    discounts,
    shippingIncome,
    netRevenue,
    cogs,
    packaging,
    courier,
    paymentFee,
    adSpend,
    returnCost,
    damageCost,
    otherVariable,
    contributionProfit,
    operatingAllocation,
    netProfit,
    units,
    grossProfit,
    grossMarginPct: ratio(grossProfit * 100, netRevenue),
    contributionMarginPct: ratio(contributionProfit * 100, netRevenue),
    netMarginPct: ratio(netProfit * 100, netRevenue),
    sources,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Return economics
 * ------------------------------------------------------------------ */

export interface ReturnEconomics {
  /** cash actually lost */
  cashCost: Money;
  /** value of stock that came back and can be sold again */
  recoveredStockValue: Money;
  /** cashCost − recoveredStockValue */
  netEconomicImpact: Money;
  outboundDelivery: Money;
  returnFee: Money;
  refund: Money;
  packagingLoss: Money;
  damageWriteoff: Money;
  adAllocation: Money;
  count: number;
}

/**
 * Return economics (spec §40). Cash cost and recovered inventory value are
 * reported SEPARATELY — returned stock is never netted against cash cost.
 */
export function returnEconomics(
  returns: readonly ReturnRecord[],
  opts: { unitCostOf: (productId: string) => Money; outboundFeeOf?: (returnId: string) => Money },
): ReturnEconomics {
  let outboundDelivery = 0 as Money;
  let returnFee = 0 as Money;
  let refund = 0 as Money;
  let packagingLoss = 0 as Money;
  let damageWriteoff = 0 as Money;
  let adAllocation = 0 as Money;
  let recoveredStockValue = 0 as Money;

  for (const r of returns) {
    const unitCost = opts.unitCostOf(r.productId);
    outboundDelivery = add(outboundDelivery, opts.outboundFeeOf?.(r.id) ?? 0);
    returnFee = add(returnFee, r.returnFee ?? 0);
    refund = add(refund, r.refund ?? 0);
    packagingLoss = add(packagingLoss, r.packagingLoss ?? 0);
    adAllocation = add(adAllocation, r.adAllocation ?? 0);
    if (r.condition === 'damaged' || r.condition === 'lost' || !r.resellable) {
      damageWriteoff = add(damageWriteoff, roundMinor(unitCost * r.qty));
    } else {
      recoveredStockValue = add(recoveredStockValue, roundMinor(unitCost * r.qty));
    }
  }

  const cashCost = add(outboundDelivery, returnFee, refund, packagingLoss, damageWriteoff, adAllocation);
  return {
    cashCost,
    recoveredStockValue,
    netEconomicImpact: sub(cashCost, recoveredStockValue),
    outboundDelivery,
    returnFee,
    refund,
    packagingLoss,
    damageWriteoff,
    adAllocation,
    count: returns.length,
  };
}

/** Cash return cost per order (used by order economics). */
export function returnCashCostByOrder(
  returns: readonly ReturnRecord[],
  unitCostOf: (productId: string) => Money,
): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const r of returns) {
    const unitCost = unitCostOf(r.productId);
    const writeoff = !r.resellable || r.condition !== 'resellable' ? roundMinor(unitCost * r.qty) : 0;
    const cost = add(r.returnFee ?? 0, r.refund ?? 0, r.packagingLoss ?? 0, r.adAllocation ?? 0, writeoff);
    out.set(r.orderId, add(out.get(r.orderId) ?? 0, cost));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 5. Purchasing
 * ------------------------------------------------------------------ */

export interface PurchaseEconomics {
  purchaseId: string;
  goodsCost: Money;
  receivedGoodsCost: Money;
  additionalCosts: Money;
  /** goods + additional costs, allocated across received units */
  landedCost: Money;
  /** per-unit landed cost, or null when nothing has been received */
  landedUnitCost: number | null;
  orderedQty: number;
  receivedQty: number;
  paid: Money;
  outstanding: Money;
}

export function purchaseEconomics(purchase: Purchase, items: readonly PurchaseItem[]): PurchaseEconomics {
  const lines = items.filter((i) => i.purchaseId === purchase.id);
  const goodsCost = sum(lines.map((i) => roundMinor(i.buyingPrice * i.qty)));
  const receivedGoodsCost = sum(lines.map((i) => roundMinor(i.buyingPrice * i.receivedQty)));
  const additionalCosts = directCostTotal(purchase.additionalCosts);
  const orderedQty = lines.reduce((a, i) => a + i.qty, 0);
  const receivedQty = lines.reduce((a, i) => a + i.receivedQty, 0);
  const landed = add(receivedGoodsCost, receivedQty > 0 ? additionalCosts : 0);
  const paid = sum(purchase.payments.map((p) => p.amount));
  return {
    purchaseId: purchase.id,
    goodsCost,
    receivedGoodsCost,
    additionalCosts,
    landedCost: landed,
    landedUnitCost: receivedQty > 0 ? ratio(landed, receivedQty) : null,
    orderedQty,
    receivedQty,
    paid,
    outstanding: sub(add(receivedGoodsCost, additionalCosts), paid),
  };
}

/**
 * Latest actual landed unit cost per product, from received purchases.
 * This is the cost that feeds COGS for sales made after the purchase.
 */
export function landedUnitCostByProduct(
  purchases: readonly Purchase[],
  items: readonly PurchaseItem[],
): Map<string, Money> {
  const byPurchase = purchases
    .filter((p) => p.status !== 'cancelled')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = new Map<string, Money>();
  for (const p of byPurchase) {
    const eco = purchaseEconomics(p, items);
    if (eco.receivedQty <= 0 || eco.landedUnitCost === null) continue;
    for (const line of items.filter((i) => i.purchaseId === p.id && i.receivedQty > 0)) {
      out.set(line.productId, roundMinor(eco.landedUnitCost));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 6. Profit & Loss
 * ------------------------------------------------------------------ */

/**
 * Expense categories that describe a *variable* cost already captured from
 * orders / ad platforms. When the corresponding P&L line has real data we do
 * not also count the expense (that would double-count). Otherwise the expense
 * is treated as an operating cost.
 */
export const VARIABLE_EXPENSE_MAP: Record<string, keyof PLVariableLines> = {
  advertising: 'advertising',
  marketing: 'advertising',
  packaging: 'packaging',
  transport: 'courier',
  courier: 'courier',
  delivery: 'courier',
  'bank fees': 'paymentFees',
  'payment gateway': 'paymentFees',
};

/** Expense categories that are capital/investing rather than operating. */
export const INVESTING_EXPENSE_CATEGORIES = new Set(['equipment', 'asset', 'investment']);

/** Expense categories that are financing rather than operating. */
export const FINANCING_EXPENSE_CATEGORIES = new Set(['capital', 'loan', 'owner draw', 'financing']);

export interface PLVariableLines {
  advertising: Money;
  courier: Money;
  packaging: Money;
  paymentFees: Money;
  returns: Money;
  damage: Money;
  otherVariable: Money;
}

export interface ProfitAndLoss {
  grossRevenue: Money;
  discounts: Money;
  shippingIncome: Money;
  netRevenue: Money;
  cogs: Money;
  grossProfit: Money;
  variable: PLVariableLines;
  variableTotal: Money;
  contributionProfit: Money;
  operatingExpenses: Money;
  netOperatingProfit: Money;
  grossMarginPct: number | null;
  contributionMarginPct: number | null;
  netMarginPct: number | null;
  /** expenses that were folded into variable lines instead of opex */
  reclassifiedExpenses: { category: string; amount: Money; line: string }[];
  operatingExpenseByCategory: { category: string; amount: Money }[];
  units: number;
  orders: number;
  aov: number | null;
}

export interface FinanceInput {
  orders: readonly Order[];
  orderItems: readonly OrderItem[];
  returns: readonly ReturnRecord[];
  damages: readonly Damage[];
  expenses: readonly Expense[];
  adRows: readonly AdRow[];
  unitCostOf: (productId: string) => Money;
  /** ad spend allocated per order (already computed) */
  adSpendByOrder?: Map<string, Money>;
}

/**
 * Profit & Loss for a set of orders (spec §46).
 * Every line is drillable: `operatingExpenseByCategory` and `variable` expose
 * the components behind each total.
 */
export function profitAndLoss(input: FinanceInput): ProfitAndLoss {
  const grossRevenue = sum(
    input.orderItems.map((i) => roundMinor(i.unitPrice * i.qty)),
  );
  const itemDiscounts = sum(input.orderItems.map((i) => i.discount ?? 0));
  const discounts = add(
    sum(input.orders.map((o) => o.discount ?? 0)),
    itemDiscounts,
  );
  const shippingIncome = sum(input.orders.map((o) => o.shippingCharged ?? 0));
  const netRevenue = sub(grossRevenue, discounts) + shippingIncome;

  const cogs = sum(input.orderItems.map((i) => roundMinor((i.unitCost ?? 0) * i.qty)));
  const grossProfit = sub(netRevenue, cogs);

  const courier = sum(input.orders.map((o) => add(o.deliveryFee ?? 0, o.codFee ?? 0)));
  const packaging = sum(input.orders.map((o) => o.packagingCost ?? 0));
  const paymentFees = sum(input.orders.map((o) => o.paymentFee ?? 0));
  const otherVariable = sum(input.orders.map((o) => o.otherCost ?? 0));
  const adSpendFromOrders = sum(input.orders.map((o) => o.adSpend ?? 0));
  const adSpendFromPlatform = sum(input.adRows.map((r) => r.spend ?? 0));

  const returnCash = sum(
    input.returns.map((r) => {
      const unitCost = input.unitCostOf(r.productId);
      const writeoff = !r.resellable || r.condition !== 'resellable' ? roundMinor(unitCost * r.qty) : 0;
      return add(r.returnFee ?? 0, r.refund ?? 0, r.packagingLoss ?? 0, r.adAllocation ?? 0, writeoff);
    }),
  );

  const damageCost = sum(
    input.damages.map((d) => sub(roundMinor((d.unitCost ?? 0) * d.qty), d.recoveredAmount ?? 0)),
  );

  // Operating expenses, minus anything that duplicates a variable line.
  const operatingByCategory = new Map<string, Money>();
  const reclassified: { category: string; amount: Money; line: string }[] = [];
  const variableFromExpenses: Record<string, Money> = {};

  for (const e of input.expenses) {
    const key = (e.category || 'Other').trim();
    const line = VARIABLE_EXPENSE_MAP[key.toLowerCase()];
    const alreadyCaptured =
      line === 'advertising'
        ? adSpendFromPlatform > 0 || adSpendFromOrders > 0
        : line === 'courier'
          ? courier > 0
          : line === 'packaging'
            ? packaging > 0
            : line === 'paymentFees'
              ? paymentFees > 0
              : false;
    if (line && alreadyCaptured) {
      reclassified.push({ category: key, amount: e.amount, line });
      variableFromExpenses[line] = add(variableFromExpenses[line] ?? 0, e.amount);
    } else {
      operatingByCategory.set(key, add(operatingByCategory.get(key) ?? 0, e.amount));
    }
  }

  const advertising = maxMoney(adSpendFromPlatform, adSpendFromOrders) + (variableFromExpenses.advertising ?? 0);
  const variable: PLVariableLines = {
    advertising,
    courier: add(courier, variableFromExpenses.courier ?? 0),
    packaging: add(packaging, variableFromExpenses.packaging ?? 0),
    paymentFees: add(paymentFees, variableFromExpenses.paymentFees ?? 0),
    returns: returnCash,
    damage: damageCost,
    otherVariable,
  };
  const variableTotal = add(
    variable.advertising,
    variable.courier,
    variable.packaging,
    variable.paymentFees,
    variable.returns,
    variable.damage,
    variable.otherVariable,
  );

  const contributionProfit = sub(grossProfit, variableTotal);
  const operatingExpenses = sum([...operatingByCategory.values()]);
  const netOperatingProfit = sub(contributionProfit, operatingExpenses);

  const units = sum(input.orderItems.map((i) => i.qty));

  return {
    grossRevenue,
    discounts,
    shippingIncome,
    netRevenue,
    cogs,
    grossProfit,
    variable,
    variableTotal,
    contributionProfit,
    operatingExpenses,
    netOperatingProfit,
    grossMarginPct: ratio(grossProfit * 100, netRevenue),
    contributionMarginPct: ratio(contributionProfit * 100, netRevenue),
    netMarginPct: ratio(netOperatingProfit * 100, netRevenue),
    reclassifiedExpenses: reclassified,
    operatingExpenseByCategory: [...operatingByCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    units,
    orders: input.orders.length,
    aov: ratio(netRevenue, input.orders.length),
  };
}

function maxMoney(a: Money, b: Money): Money {
  return a >= b ? a : b;
}

/* ------------------------------------------------------------------ *
 * 7. Break-even
 * ------------------------------------------------------------------ */

export interface BreakEven {
  fixedCosts: Money;
  variableCosts: Money;
  contributionMarginPct: number | null;
  breakEvenRevenue: Money | null;
  currentRevenue: Money;
  revenueGap: Money | null;
  coveragePct: number | null;
  /** human-readable reason when break-even cannot be computed */
  unavailableReason: 'no-revenue' | 'no-contribution' | null;
}

/**
 * Break-even (spec §48). When contribution margin is zero or negative we do
 * NOT invent a number — we return null with an explicit reason.
 */
export function breakEven(pl: ProfitAndLoss, fixedCosts: Money | null = null): BreakEven {
  const fixed = fixedCosts ?? pl.operatingExpenses;
  const variableCosts = add(pl.cogs, pl.variableTotal);
  const cm = pl.contributionMarginPct;
  const cmRatio = cm === null ? null : cm / 100;

  if (pl.netRevenue <= 0) {
    return {
      fixedCosts: fixed,
      variableCosts,
      contributionMarginPct: cm,
      breakEvenRevenue: null,
      currentRevenue: pl.netRevenue,
      revenueGap: null,
      coveragePct: null,
      unavailableReason: 'no-revenue',
    };
  }
  if (cmRatio === null || cmRatio <= 0) {
    return {
      fixedCosts: fixed,
      variableCosts,
      contributionMarginPct: cm,
      breakEvenRevenue: null,
      currentRevenue: pl.netRevenue,
      revenueGap: null,
      coveragePct: null,
      unavailableReason: 'no-contribution',
    };
  }
  const breakEvenRevenue = roundMinor(fixed / cmRatio);
  const gap = sub(breakEvenRevenue, pl.netRevenue);
  return {
    fixedCosts: fixed,
    variableCosts,
    contributionMarginPct: cm,
    breakEvenRevenue,
    currentRevenue: pl.netRevenue,
    revenueGap: gap,
    coveragePct: ratio(pl.netRevenue * 100, breakEvenRevenue),
    unavailableReason: null,
  };
}

/* ------------------------------------------------------------------ *
 * 8. Cash flow
 * ------------------------------------------------------------------ */

export interface CashFlow {
  openingCash: Money;
  operatingIn: Money;
  operatingOut: Money;
  investingOut: Money;
  financingNet: Money;
  closingCash: Money;
  netChange: Money;
  lines: { label: string; direction: 'in' | 'out'; amount: Money; group: 'operating' | 'investing' | 'financing' }[];
}

export interface CashFlowInput {
  /** cash position at the very start of the business */
  openingBalance: Money;
  /** net cash movement before the reporting period starts */
  priorNetCash: Money;
  payments: readonly Payment[];
  purchasePayments: { date: string; amount: Money; label: string }[];
  expenses: readonly Expense[];
  manual: readonly ManualLedgerEntry[];
}

export function cashFlow(input: CashFlowInput): CashFlow {
  const lines: CashFlow['lines'] = [];
  let operatingIn = 0 as Money;
  let operatingOut = 0 as Money;
  let investingOut = 0 as Money;
  let financingNet = 0 as Money;

  for (const p of input.payments) {
    if (p.type === 'in') {
      operatingIn = add(operatingIn, p.amount);
    } else {
      operatingOut = add(operatingOut, p.amount);
    }
  }

  for (const pp of input.purchasePayments) {
    operatingOut = add(operatingOut, pp.amount);
  }

  for (const e of input.expenses) {
    const cat = (e.category || '').toLowerCase();
    if (INVESTING_EXPENSE_CATEGORIES.has(cat)) {
      investingOut = add(investingOut, e.amount);
    } else if (FINANCING_EXPENSE_CATEGORIES.has(cat)) {
      financingNet = sub(financingNet, e.amount);
    } else {
      operatingOut = add(operatingOut, e.amount);
    }
  }

  for (const m of input.manual) {
    const cat = (m.category || '').toLowerCase();
    if (FINANCING_EXPENSE_CATEGORIES.has(cat)) {
      financingNet = m.direction === 'in' ? add(financingNet, m.amount) : sub(financingNet, m.amount);
    } else if (m.direction === 'in') {
      operatingIn = add(operatingIn, m.amount);
    } else {
      operatingOut = add(operatingOut, m.amount);
    }
  }

  const operatingNet = sub(operatingIn, operatingOut);
  const netChange = add(operatingNet, -investingOut, financingNet);
  const openingCash = add(input.openingBalance, input.priorNetCash);

  lines.push(
    { label: 'Customer payments', direction: 'in', amount: operatingIn, group: 'operating' },
    { label: 'Operating payments out', direction: 'out', amount: operatingOut, group: 'operating' },
    { label: 'Equipment & assets', direction: 'out', amount: investingOut, group: 'investing' },
    { label: 'Capital / loans', direction: financingNet >= 0 ? 'in' : 'out', amount: Math.abs(financingNet), group: 'financing' },
  );

  return {
    openingCash,
    operatingIn,
    operatingOut,
    investingOut,
    financingNet,
    closingCash: add(openingCash, netChange),
    netChange,
    lines: lines.filter((l) => l.amount !== 0),
  };
}

/**
 * Build the derived cash ledger projection from source records.
 * Because it is always rebuilt from scratch, orphan ledger rows cannot exist.
 */
export function buildLedger(input: {
  payments: readonly Payment[];
  purchasePayments: { date: string; amount: Money; label: string; refId: string }[];
  expenses: readonly Expense[];
  manual: readonly ManualLedgerEntry[];
}): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const p of input.payments) {
    out.push({
      id: `pay:${p.id}`,
      date: p.date,
      direction: p.type === 'in' ? 'in' : 'out',
      category: p.type === 'in' ? 'Sales' : 'Refund',
      label: p.note || p.method,
      amount: p.amount,
      refType: 'payment',
      refId: p.id,
    });
  }
  for (const pp of input.purchasePayments) {
    out.push({
      id: `pur:${pp.refId}:${pp.date}:${pp.amount}`,
      date: pp.date,
      direction: 'out',
      category: 'Purchasing',
      label: pp.label,
      amount: pp.amount,
      refType: 'purchase',
      refId: pp.refId,
    });
  }
  for (const e of input.expenses) {
    out.push({
      id: `exp:${e.id}`,
      date: e.date,
      direction: 'out',
      category: e.category,
      label: e.note || e.vendor || e.category,
      amount: e.amount,
      refType: 'expense',
      refId: e.id,
    });
  }
  for (const m of input.manual) {
    out.push({
      id: `man:${m.id}`,
      date: m.date,
      direction: m.direction,
      category: m.category,
      label: m.note || m.category,
      amount: m.amount,
      refType: 'manual',
      refId: m.id,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ------------------------------------------------------------------ *
 * 9. Balance sheet style positions
 * ------------------------------------------------------------------ */

export interface Positions {
  cash: Money;
  receivables: Money;
  payables: Money;
  inventoryValue: Money;
  pendingCod: Money;
  pendingSettlement: Money;
}

export interface PositionsInput {
  cash: Money;
  orders: readonly Order[];
  /** net revenue per order, computed by `orderEconomics` (never re-derived here) */
  netRevenueByOrder: Map<string, Money>;
  payments: readonly Payment[];
  purchases: readonly Purchase[];
  purchaseItems: readonly PurchaseItem[];
  inventoryValue: Money;
  /** delivered orders whose courier has not settled yet */
  unsettledOrders: readonly Order[];
}

/**
 * Cash ≠ profit (spec §34). This keeps the two apart explicitly:
 * receivables are unpaid/underpaid orders, payables are unpaid purchases,
 * pending COD is money physically sitting with the courier.
 */
export function positions(input: PositionsInput): Positions {
  const paidByOrder = new Map<string, Money>();
  for (const p of input.payments) {
    const signed = p.type === 'in' ? p.amount : -p.amount;
    paidByOrder.set(p.orderId, add(paidByOrder.get(p.orderId) ?? 0, signed));
  }

  const dueOf = (o: Order): Money => {
    const revenue = input.netRevenueByOrder.get(o.id) ?? 0;
    return sub(revenue, paidByOrder.get(o.id) ?? 0);
  };

  let receivables = 0 as Money;
  for (const o of input.orders) {
    if (o.status === 'cancelled' || o.status === 'failed') continue;
    const due = dueOf(o);
    if (due > 0) receivables = add(receivables, due);
  }

  let payables = 0 as Money;
  for (const p of input.purchases) {
    if (p.status === 'cancelled') continue;
    payables = add(payables, purchaseEconomics(p, input.purchaseItems).outstanding);
  }

  const pendingCod = sum(
    input.orders
      .filter((o) => o.status === 'delivered')
      .map(dueOf)
      .map((v) => (v > 0 ? v : 0)),
  );
  const pendingSettlement = sum(input.unsettledOrders.map(dueOf).map((v) => (v > 0 ? v : 0)));

  return {
    cash: input.cash,
    receivables,
    payables,
    inventoryValue: input.inventoryValue,
    pendingCod,
    pendingSettlement,
  };
}

/* ------------------------------------------------------------------ *
 * 10. Concentration
 * ------------------------------------------------------------------ */

export interface ConcentrationReport {
  topProductShare: number | null;
  top3ProductShare: number | null;
  topCustomerShare: number | null;
  top3CustomerShare: number | null;
  topChannelShare: number | null;
  topSupplierShare: number | null;
  topAdPlatformShare: number | null;
  hhi: number;
}

export function concentration(values: readonly number[]): { top: number | null; top3: number | null; hhi: number } {
  const total = sum(values);
  if (total <= 0) return { top: null, top3: null, hhi: 0 };
  const sorted = [...values].sort((a, b) => b - a);
  const top = sorted[0] / total;
  const top3 = sorted.slice(0, 3).reduce((a, b) => a + b, 0) / total;
  const hhi = values.reduce((acc, v) => acc + (v / total) ** 2, 0);
  return { top, top3, hhi };
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

/** Parse a user-entered money string into minor units (used by forms/imports). */
export function parseMoneyInput(value: string | number | null | undefined): Money {
  return money(value);
}

/** Total of a numeric field across rows. */
export function totalBy<T>(rows: readonly T[], pick: (row: T) => Money): Money {
  return sum(rows.map(pick));
}
