/**
 * ANALYTICS LAYER
 * ===============
 * Pure functions over `WorkspaceData`. No Dexie, no React — which is why every
 * dashboard tile, report and insight is covered by automated tests.
 */
import { add, ratio, roundMinor, sub, sum, type Money } from '../lib/money';
import { eachDay, monthKey, type DateRange } from '../lib/dates';
import {
  adMetrics,
  adProfitabilityForRows,
  aggregateAdRows,
  breakEvenRoas,
  contributionMarginBeforeAds,
  type AdMetrics,
  type AdProfitability,
} from './ads';
import {
  breakEven,
  cashFlow,
  daysOfStock,
  landedUnitCostByProduct,
  orderEconomics,
  positions,
  profitAndLoss,
  purchaseEconomics,
  returnCashCostByOrder,
  returnEconomics,
  stockFromMovements,
  stockTurnover,
  trueUnitCost,
  type BreakEven,
  type CashFlow,
  type OrderEconomics,
  type Positions,
  type ProfitAndLoss,
  type ReturnEconomics,
} from './finance';
import type {
  AdRow,
  Courier,
  Customer,
  Damage,
  Expense,
  InventoryMovement,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  RecurringExpense,
  ReturnRecord,
  Settings,
  Supplier,
} from './types';
import type { WorkspaceData } from '../db';

/* ------------------------------------------------------------------ *
 * Range selection
 * ------------------------------------------------------------------ */

export interface PeriodData {
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
  returns: ReturnRecord[];
  damages: Damage[];
  expenses: Expense[];
  adRows: AdRow[];
  purchases: Purchase[];
  movements: InventoryMovement[];
}

type Span = Pick<DateRange, 'start' | 'end'>;
const inRange = (date: string, range: Span): boolean => date >= range.start && date <= range.end;

export function selectPeriod(data: WorkspaceData, range: DateRange): PeriodData {
  const orders = data.orders.filter((o) => inRange(o.date, range));
  const orderIds = new Set(orders.map((o) => o.id));
  return {
    orders,
    orderItems: data.orderItems.filter((i) => orderIds.has(i.orderId)),
    payments: data.payments.filter((p) => inRange(p.date, range)),
    returns: data.returns.filter((r) => inRange(r.date, range)),
    damages: data.damages.filter((d) => inRange(d.date, range)),
    expenses: data.expenses.filter((e) => inRange(e.date, range)),
    adRows: data.adRows.filter((r) => inRange(r.date, range)),
    purchases: data.purchases.filter((p) => inRange(p.date, range)),
    movements: data.movements.filter((m) => inRange(m.date, range)),
  };
}

/* ------------------------------------------------------------------ *
 * Cost resolution
 * ------------------------------------------------------------------ */

/** True unit cost per product, preferring the latest received purchase cost. */
export function unitCostMap(data: WorkspaceData): Map<string, Money> {
  const fromPurchases = landedUnitCostByProduct(data.purchases, data.purchaseItems);
  const out = new Map<string, Money>();
  for (const p of data.products) out.set(p.id, trueUnitCost(p, fromPurchases.get(p.id) ?? null));
  return out;
}

export function productMap(data: WorkspaceData): Map<string, Product> {
  return new Map(data.products.map((p) => [p.id, p]));
}

/**
 * Unit cost lookup that resolves BOTH product ids and SKUs.
 *
 * Ad exports from Meta/Google/TikTok usually carry a SKU rather than our
 * internal id, so a lookup keyed only by id silently resolves those rows to a
 * cost of 0 and overstates ad profit. SKU keys are lower-cased because ad
 * platforms change casing on export.
 */
export function unitCostLookup(data: WorkspaceData): Map<string, Money> {
  const byId = unitCostMap(data);
  const out = new Map<string, Money>(byId);
  for (const p of data.products) {
    const cost = byId.get(p.id) ?? 0;
    if (p.sku) out.set(p.sku, cost);
    if (p.sku) out.set(p.sku.toLowerCase(), cost);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Ad allocation
 * ------------------------------------------------------------------ */

/**
 * Allocate ad spend to orders.
 * Orders with explicit spend keep it. Remaining platform spend is spread over
 * attributed orders by net-revenue share. The result is an ESTIMATE and the UI
 * labels it as such.
 */
export function allocateAdSpend(
  orders: readonly Order[],
  orderItems: readonly OrderItem[],
  adRows: readonly AdRow[],
): { byOrder: Map<string, Money>; unallocated: Money; estimated: boolean } {
  const explicit = new Map<string, Money>();
  let explicitTotal = 0 as Money;
  for (const o of orders) {
    if ((o.adSpend ?? 0) > 0) {
      explicit.set(o.id, o.adSpend);
      explicitTotal = add(explicitTotal, o.adSpend);
    }
  }

  const platformSpend = sum(adRows.map((r) => r.spend ?? 0));
  const remaining = sub(platformSpend, explicitTotal);
  const byOrder = new Map(explicit);

  if (remaining <= 0) return { byOrder, unallocated: 0, estimated: explicitTotal > 0 };

  const revenueByOrder = new Map<string, Money>();
  for (const item of orderItems) {
    revenueByOrder.set(
      item.orderId,
      add(revenueByOrder.get(item.orderId) ?? 0, roundMinor(item.unitPrice * item.qty)),
    );
  }
  const attributed = orders.filter((o) => o.attribution?.campaign || o.attribution?.platform);
  const pool = attributed.length > 0 ? attributed : orders;
  const base = sum(pool.map((o) => revenueByOrder.get(o.id) ?? 0));

  if (base <= 0) return { byOrder, unallocated: remaining, estimated: true };

  for (const o of pool) {
    const share = (revenueByOrder.get(o.id) ?? 0) / base;
    byOrder.set(o.id, add(byOrder.get(o.id) ?? 0, roundMinor(remaining * share)));
  }
  return { byOrder, unallocated: 0, estimated: true };
}

/* ------------------------------------------------------------------ *
 * Period metrics
 * ------------------------------------------------------------------ */

export interface PeriodMetrics {
  range: DateRange;
  pl: ProfitAndLoss;
  cash: CashFlow;
  positions: Positions;
  breakEven: BreakEven;
  ad: AdMetrics;
  adProfit: AdProfitability;
  returns: ReturnEconomics;
  mer: number | null;
  breakEvenRoasValue: number | null;
  returnRatePct: number | null;
  deliverySuccessPct: number | null;
  failedDeliveryPct: number | null;
  inventoryValue: Money;
  cashRunwayDays: number | null;
  unitsSold: number;
  orderEconomicsByOrder: Map<string, OrderEconomics>;
  adAllocationEstimated: boolean;
  unallocatedAdSpend: Money;
  newCustomers: number;
}

export interface MetricsInput {
  data: WorkspaceData;
  period: PeriodData;
  range: DateRange;
  settings: Settings;
}

export function computePeriodMetrics(input: MetricsInput): PeriodMetrics {
  const { data, period, range, settings } = input;
  const products = productMap(data);
  const costs = unitCostMap(data);
  const unitCostOf = (id: string) => costs.get(id) ?? 0;
  /** resolves product ids AND SKUs — ad rows usually carry a SKU */
  const adCostOf = unitCostLookup(data);
  const couriers = new Map(data.couriers.map((c) => [c.id, c]));

  const adAllocation = allocateAdSpend(period.orders, period.orderItems, period.adRows);

  const pl = profitAndLoss({
    orders: period.orders,
    orderItems: period.orderItems,
    returns: period.returns,
    damages: period.damages,
    expenses: period.expenses,
    adRows: period.adRows,
    unitCostOf,
    adSpendByOrder: adAllocation.byOrder,
  });

  // Per-order economics (operating cost allocated by net-revenue share).
  const orderEconomicsByOrder = new Map<string, OrderEconomics>();
  for (const order of period.orders) {
    orderEconomicsByOrder.set(
      order.id,
      orderEconomics(order, period.orderItems, {
        productById: products,
        courierById: couriers,
        returnCostByOrder: returnCashCostByOrder(period.returns, unitCostOf),
        adSpendByOrder: adAllocation.byOrder,
        operatingCost: pl.operatingExpenses,
        operatingCostBase: pl.netRevenue,
      }),
    );
  }

  const netRevenueByOrder = new Map(
    [...orderEconomicsByOrder.entries()].map(([id, e]) => [id, e.netRevenue]),
  );

  // --- cash ---------------------------------------------------------------
  const paidByOrder = new Map<string, Money>();
  for (const p of data.payments) {
    const signed = p.type === 'in' ? p.amount : -p.amount;
    paidByOrder.set(p.orderId, add(paidByOrder.get(p.orderId) ?? 0, signed));
  }
  const priorNet = priorNetCash(data, range.start);
  const purchasePayments = period.purchases.flatMap((p) =>
    p.payments
      .filter((pp) => inRange(pp.date, range))
      .map((pp) => ({ date: pp.date, amount: pp.amount, label: `${p.ref} — ${pp.method}` })),
  );
  const cash = cashFlow({
    openingBalance: settings.openingCash,
    priorNetCash: priorNet,
    payments: period.payments,
    purchasePayments,
    expenses: period.expenses,
    manual: data.manualLedger.filter((m) => inRange(m.date, range)),
  });

  // --- positions ----------------------------------------------------------
  const unsettled = period.orders.filter((o) => {
    if (o.status !== 'delivered') return false;
    const courier = o.courierId ? couriers.get(o.courierId) : undefined;
    const lag = courier?.settlementDays ?? 3;
    const settled = data.payments.some((p) => p.orderId === o.id && p.type === 'settlement');
    if (settled) return false;
    return daysBetweenISO(o.date, range.end) <= lag;
  });

  const inventoryValue = computeInventoryValue(data);
  const pos = positions({
    cash: cash.closingCash,
    orders: period.orders,
    netRevenueByOrder,
    payments: data.payments.filter((p) => period.orders.some((o) => o.id === p.orderId)),
    purchases: data.purchases,
    purchaseItems: data.purchaseItems,
    inventoryValue,
    unsettledOrders: unsettled,
  });

  // --- advertising --------------------------------------------------------
  const totals = aggregateAdRows(period.adRows);
  const newCustomers = countNewCustomers(data, range);
  const mer = ratio(pl.netRevenue / 100, sum(data.adRows.filter((r) => inRange(r.date, range)).map((r) => r.spend)) / 100);
  const ad = adMetrics(totals, { mer, newCustomers, days: range.days });

  const returnRate = returnRatePct(period.returns, period.orderItems);
  const adProfit = adProfitabilityForRows({
    rows: period.adRows,
    totals,
    pl,
    unitCostOf: (key) => adCostOf.get(key) ?? 0,
  });

  const cmBeforeAds = contributionMarginBeforeAds({
    netRevenue: pl.netRevenue,
    cogs: pl.cogs,
    courier: pl.variable.courier,
    packaging: pl.variable.packaging,
    paymentFees: pl.variable.paymentFees,
    returnCost: pl.variable.returns,
    otherVariable: pl.variable.otherVariable,
  });

  const dailyBurn = range.days > 0 ? (cash.operatingOut + cash.investingOut) / range.days : 0;
  const runway = dailyBurn > 0 ? cash.closingCash / dailyBurn : null;

  return {
    range,
    pl,
    cash,
    positions: pos,
    breakEven: breakEven(pl),
    ad,
    adProfit,
    returns: returnEconomics(period.returns, { unitCostOf }),
    mer,
    breakEvenRoasValue: breakEvenRoas(cmBeforeAds),
    returnRatePct: returnRate,
    deliverySuccessPct: deliverySuccessPct(period.orders),
    failedDeliveryPct: failedDeliveryPct(period.orders),
    inventoryValue,
    cashRunwayDays: runway,
    unitsSold: pl.units,
    orderEconomicsByOrder,
    adAllocationEstimated: adAllocation.estimated,
    unallocatedAdSpend: adAllocation.unallocated,
    newCustomers,
  };
}

function daysBetweenISO(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((pb - pa) / 86_400_000);
}

/** Net cash movement strictly before `startISO`. */
export function priorNetCash(data: WorkspaceData, startISO: string): Money {
  let net = 0 as Money;
  for (const p of data.payments) {
    if (p.date >= startISO) continue;
    net = p.type === 'in' ? add(net, p.amount) : sub(net, p.amount);
  }
  for (const purchase of data.purchases) {
    for (const pp of purchase.payments) {
      if (pp.date >= startISO) continue;
      net = sub(net, pp.amount);
    }
  }
  for (const e of data.expenses) {
    if (e.date >= startISO) continue;
    net = sub(net, e.amount);
  }
  for (const m of data.manualLedger) {
    if (m.date >= startISO) continue;
    net = m.direction === 'in' ? add(net, m.amount) : sub(net, m.amount);
  }
  return net;
}

/** Cash on hand as of a date (inclusive). */
export function cashAt(data: WorkspaceData, dateISO: string, opening: Money): Money {
  return add(opening, priorNetCash(data, addOneDay(dateISO)));
}

function addOneDay(iso: string): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Order health
 * ------------------------------------------------------------------ */

const DELIVERED: Order['status'][] = ['delivered'];
const FAILED: Order['status'][] = ['cancelled', 'failed', 'returned'];

export function returnRatePct(returns: readonly ReturnRecord[], items: readonly OrderItem[]): number | null {
  const units = sum(items.map((i) => i.qty));
  if (units <= 0) return null;
  return (sum(returns.map((r) => r.qty)) / units) * 100;
}

export function deliverySuccessPct(orders: readonly Order[]): number | null {
  const closed = orders.filter((o) => DELIVERED.includes(o.status) || FAILED.includes(o.status));
  if (closed.length === 0) return null;
  return (closed.filter((o) => o.status === 'delivered').length / closed.length) * 100;
}

export function failedDeliveryPct(orders: readonly Order[]): number | null {
  const closed = orders.filter((o) => DELIVERED.includes(o.status) || FAILED.includes(o.status));
  if (closed.length === 0) return null;
  return (closed.filter((o) => FAILED.includes(o.status)).length / closed.length) * 100;
}

export function countNewCustomers(data: WorkspaceData, range: DateRange): number {
  return data.customers.filter((c) => c.createdAt >= range.start && c.createdAt <= range.end).length;
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export interface InventoryRow {
  product: Product;
  onHand: number;
  reserved: number;
  available: number;
  unitCost: Money;
  value: Money;
  unitsSold: number;
  turnover: number | null;
  daysLeft: number | null;
  lastSaleDate: string | null;
  daysSinceSale: number | null;
  state: 'out' | 'critical' | 'low' | 'healthy' | 'overstock' | 'dead' | 'slow';
  stockIn: number;
  stockOut: number;
}

export interface InventoryAnalytics {
  rows: InventoryRow[];
  totalValue: Money;
  totalUnits: number;
  deadStockValue: Money;
  slowStockValue: Money;
  overstockValue: Money;
  stockoutRisk: InventoryRow[];
  deadStock: InventoryRow[];
  slowMovers: InventoryRow[];
  fastMovers: InventoryRow[];
  overstock: InventoryRow[];
  averageTurnover: number | null;
}

export function computeInventoryValue(data: WorkspaceData): Money {
  const costs = unitCostMap(data);
  return sum(
    data.products.map((p) => {
      const pos = stockFromMovements(p.id, data.movements, costs.get(p.id) ?? 0);
      return pos.inventoryValue;
    }),
  );
}

export function computeInventoryAnalytics(
  data: WorkspaceData,
  range: DateRange,
  settings: Settings,
): InventoryAnalytics {
  const costs = unitCostMap(data);
  const period = selectPeriod(data, range);
  const soldByProduct = new Map<string, number>();
  for (const item of period.orderItems) {
    if (item.qty <= 0) continue;
    soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.qty);
  }
  const reservedByProduct = reservedByProductFromOrders(data);
  const lastSale = lastSaleDateByProduct(data);
  const t = settings.thresholds;

  const rows: InventoryRow[] = data.products.map((product) => {
    const unitCost = costs.get(product.id) ?? 0;
    const pos = stockFromMovements(product.id, data.movements, unitCost);
    const reserved = reservedByProduct.get(product.id) ?? 0;
    const available = pos.onHand - reserved;
    const unitsSold = soldByProduct.get(product.id) ?? 0;
    const openingStock = averageStock(product, data, range);
    const turnover = stockTurnover(unitsSold, openingStock);
    const daysLeft = daysOfStock(available, unitsSold, range.days);
    const last = lastSale.get(product.id) ?? null;
    const daysSince = last ? daysBetweenISO(last, range.end) : null;

    let state: InventoryRow['state'] = 'healthy';
    if (pos.onHand <= 0) state = 'out';
    else if (daysLeft !== null && daysLeft <= t.stockoutDays) state = 'critical';
    else if (product.reorderLevel > 0 && available <= product.reorderLevel) state = 'low';
    else if (daysSince !== null && daysSince >= t.deadStockDays) state = 'dead';
    else if (daysLeft !== null && daysLeft > 180) state = 'overstock';
    else if (daysSince !== null && daysSince >= t.slowMoverDays) state = 'slow';

    return {
      product,
      onHand: pos.onHand,
      reserved,
      available,
      unitCost,
      value: pos.inventoryValue,
      unitsSold,
      turnover,
      daysLeft,
      lastSaleDate: last,
      daysSinceSale: daysSince,
      state,
      stockIn: pos.totalIn,
      stockOut: pos.totalOut,
    };
  });

  const totalValue = sum(rows.map((r) => r.value));
  const totalUnits = sum(rows.map((r) => r.onHand));
  const deadStock = rows.filter((r) => r.state === 'dead');
  const slowMovers = rows.filter((r) => r.state === 'slow');
  const overstock = rows.filter((r) => r.state === 'overstock');
  const stockoutRisk = rows
    .filter((r) => r.state === 'out' || r.state === 'critical' || r.state === 'low')
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const fastMovers = rows
    .filter((r) => r.unitsSold > 0)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

  const turnovers = rows.map((r) => r.turnover).filter((v): v is number => v !== null);

  return {
    rows,
    totalValue,
    totalUnits,
    deadStockValue: sum(deadStock.map((r) => r.value)),
    slowStockValue: sum(slowMovers.map((r) => r.value)),
    overstockValue: sum(overstock.map((r) => r.value)),
    stockoutRisk,
    deadStock,
    slowMovers,
    fastMovers,
    overstock,
    averageTurnover: turnovers.length ? turnovers.reduce((a, b) => a + b, 0) / turnovers.length : null,
  };
}

function reservedByProductFromOrders(data: WorkspaceData): Map<string, number> {
  const open = new Set(['pending', 'confirmed', 'packed', 'shipped']);
  const statusById = new Map(data.orders.map((o) => [o.id, o.status]));
  const out = new Map<string, number>();
  for (const item of data.orderItems) {
    if (!open.has(statusById.get(item.orderId) ?? '')) continue;
    out.set(item.productId, (out.get(item.productId) ?? 0) + item.qty);
  }
  return out;
}

function lastSaleDateByProduct(data: WorkspaceData): Map<string, string> {
  const orderIdToProduct = new Map<string, string[]>();
  for (const item of data.orderItems) {
    const list = orderIdToProduct.get(item.orderId) ?? [];
    list.push(item.productId);
    orderIdToProduct.set(item.orderId, list);
  }
  const out = new Map<string, string>();
  for (const order of data.orders) {
    if (order.status === 'cancelled' || order.status === 'failed') continue;
    for (const pid of orderIdToProduct.get(order.id) ?? []) {
      const current = out.get(pid);
      if (!current || order.date > current) out.set(pid, order.date);
    }
  }
  return out;
}

/** Average stock over the period: opening stock + purchases − half of sales. */
function averageStock(product: Product, data: WorkspaceData, range: DateRange): number {
  const before = data.movements
    .filter((m) => m.productId === product.id && m.date < range.start)
    .reduce((acc, m) => acc + m.qty, 0);
  const during = data.movements
    .filter((m) => m.productId === product.id && inRange(m.date, range))
    .reduce((acc, m) => acc + m.qty, 0);
  const end = before + during;
  const start = before;
  return Math.max(0.0001, (start + end) / 2);
}

/* ------------------------------------------------------------------ *
 * Product profitability
 * ------------------------------------------------------------------ */

export interface ProductProfitRow {
  product: Product;
  units: number;
  orders: number;
  revenue: Money;
  discounts: Money;
  netRevenue: Money;
  cogs: Money;
  trueUnitCost: Money;
  grossProfit: Money;
  grossMarginPct: number | null;
  adSpend: Money;
  courier: Money;
  packaging: Money;
  paymentFees: Money;
  returnCost: Money;
  contributionProfit: Money;
  netProfit: Money;
  netMarginPct: number | null;
  roas: number | null;
  breakEvenRoasValue: number | null;
  profitPerUnit: Money;
  returnRatePct: number | null;
  stock: number;
}

export function computeProductProfitability(
  data: WorkspaceData,
  period: PeriodData,
): ProductProfitRow[] {
  const products = productMap(data);
  const costs = unitCostMap(data);
  const unitCostOf = (id: string) => costs.get(id) ?? 0;
  const adAllocation = allocateAdSpend(period.orders, period.orderItems, period.adRows);
  const returnCostByOrder = returnCashCostByOrder(period.returns, unitCostOf);
  const couriers = new Map(data.couriers.map((c) => [c.id, c]));

  const rows = new Map<string, ProductProfitRow>();
  const ensure = (product: Product): ProductProfitRow => {
    let row = rows.get(product.id);
    if (!row) {
      row = {
        product,
        units: 0,
        orders: 0,
        revenue: 0,
        discounts: 0,
        netRevenue: 0,
        cogs: 0,
        trueUnitCost: unitCostOf(product.id),
        grossProfit: 0,
        grossMarginPct: null,
        adSpend: 0,
        courier: 0,
        packaging: 0,
        paymentFees: 0,
        returnCost: 0,
        contributionProfit: 0,
        netProfit: 0,
        netMarginPct: null,
        roas: null,
        breakEvenRoasValue: null,
        profitPerUnit: 0,
        returnRatePct: null,
        stock: stockFromMovements(product.id, data.movements, unitCostOf(product.id)).onHand,
      };
      rows.set(product.id, row);
    }
    return row;
  };

  // revenue + cogs
  for (const item of period.orderItems) {
    const product = products.get(item.productId);
    if (!product) continue;
    const row = ensure(product);
    const lineRevenue = roundMinor(item.unitPrice * item.qty);
    row.units += item.qty;
    row.revenue = add(row.revenue, lineRevenue);
    row.discounts = add(row.discounts, item.discount ?? 0);
    row.cogs = add(row.cogs, roundMinor((item.unitCost ?? 0) * item.qty));
  }

  // per-order cost lines split across the order's items by revenue share
  for (const order of period.orders) {
    const items = period.orderItems.filter((i) => i.orderId === order.id);
    if (items.length === 0) continue;
    const weights = items.map((i) => i.unitPrice * i.qty);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const eco = orderEconomics(order, period.orderItems, {
      productById: products,
      courierById: couriers,
      returnCostByOrder,
      adSpendByOrder: adAllocation.byOrder,
    });
    items.forEach((item, idx) => {
      const product = products.get(item.productId);
      if (!product) return;
      const row = ensure(product);
      const share = totalWeight > 0 ? weights[idx] / totalWeight : 1 / items.length;
      row.courier = add(row.courier, roundMinor(eco.courier * share));
      row.packaging = add(row.packaging, roundMinor(eco.packaging * share));
      row.paymentFees = add(row.paymentFees, roundMinor(eco.paymentFee * share));
      row.adSpend = add(row.adSpend, roundMinor(eco.adSpend * share));
      row.returnCost = add(row.returnCost, roundMinor(eco.returnCost * share));
      row.orders += 1;
    });
  }

  // returned units per product (feeds the per-product return rate)
  const returnedUnits = new Map<string, number>();
  for (const r of period.returns) returnedUnits.set(r.productId, (returnedUnits.get(r.productId) ?? 0) + r.qty);

  for (const row of rows.values()) {
    row.netRevenue = sub(row.revenue, row.discounts);
    row.grossProfit = sub(row.netRevenue, row.cogs);
    row.grossMarginPct = ratio(row.grossProfit * 100, row.netRevenue);
    row.contributionProfit = sub(
      row.netRevenue,
      row.cogs,
      row.courier,
      row.packaging,
      row.paymentFees,
      row.adSpend,
      row.returnCost,
    );
    row.netMarginPct = ratio(row.contributionProfit * 100, row.netRevenue);
    row.roas = ratio(row.netRevenue / 100, row.adSpend / 100);
    const cmBeforeAds = contributionMarginBeforeAds({
      netRevenue: row.netRevenue,
      cogs: row.cogs,
      courier: row.courier,
      packaging: row.packaging,
      paymentFees: row.paymentFees,
      returnCost: row.returnCost,
      otherVariable: 0,
    });
    row.breakEvenRoasValue = breakEvenRoas(cmBeforeAds);
    row.profitPerUnit = row.units > 0 ? roundMinor(row.contributionProfit / row.units) : 0;
    const sold = row.units + (returnedUnits.get(row.product.id) ?? 0);
    row.returnRatePct = sold > 0 ? ((returnedUnits.get(row.product.id) ?? 0) / sold) * 100 : null;
  }

  // Include products with no sales in the period so "dead stock" is visible.
  for (const product of data.products) {
    if (!rows.has(product.id)) ensure(product);
  }

  return [...rows.values()].sort((a, b) => b.contributionProfit - a.contributionProfit);
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export type CustomerSegment =
  | 'vip'
  | 'high-value'
  | 'repeat'
  | 'new'
  | 'one-time'
  | 'at-risk'
  | 'win-back'
  | 'high-return';

export interface CustomerRow {
  customer: Customer;
  orders: number;
  revenue: Money;
  profit: Money;
  aov: number | null;
  profitPerOrder: Money;
  ltv: Money;
  repeatRatePct: number | null;
  returnRatePct: number | null;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  segment: CustomerSegment;
  source: string;
}

export function computeCustomerAnalytics(data: WorkspaceData, range: DateRange): CustomerRow[] {
  const period = selectPeriod(data, range);
  const costs = unitCostMap(data);
  const adAllocation = allocateAdSpend(period.orders, period.orderItems, period.adRows);
  const returnCostByOrder = returnCashCostByOrder(period.returns, (id) => costs.get(id) ?? 0);
  const couriers = new Map(data.couriers.map((c) => [c.id, c]));
  const products = productMap(data);

  const stats = new Map<
    string,
    { orders: number; revenue: Money; profit: Money; returned: number; units: number; last: string | null }
  >();

  for (const order of period.orders) {
    if (!order.customerId) continue;
    if (order.status === 'cancelled') continue;
    const eco = orderEconomics(order, period.orderItems, {
      productById: products,
      courierById: couriers,
      returnCostByOrder,
      adSpendByOrder: adAllocation.byOrder,
    });
    const s = stats.get(order.customerId) ?? {
      orders: 0,
      revenue: 0,
      profit: 0,
      returned: 0,
      units: 0,
      last: null,
    };
    s.orders += 1;
    s.revenue = add(s.revenue, eco.netRevenue);
    s.profit = add(s.profit, eco.contributionProfit);
    s.units += eco.units;
    if (!s.last || order.date > s.last) s.last = order.date;
    stats.set(order.customerId, s);
  }

  for (const r of period.returns) {
    const order = data.orders.find((o) => o.id === r.orderId);
    if (!order?.customerId) continue;
    const s = stats.get(order.customerId);
    if (s) s.returned += r.qty;
  }

  const rows: CustomerRow[] = data.customers
    .filter((c) => stats.has(c.id))
    .map((customer) => {
      const s = stats.get(customer.id)!;
      const repeatRate = s.orders > 0 ? ((s.orders - 1) / s.orders) * 100 : null;
      const daysSince = s.last ? daysBetweenISO(s.last, range.end) : null;
      const returnRate = s.units + s.returned > 0 ? (s.returned / (s.units + s.returned)) * 100 : null;
      const segment = segmentCustomer({
        orders: s.orders,
        profit: s.profit,
        daysSince,
        returnRate,
        newSinceDays: daysBetweenISO(customer.createdAt, range.end),
      });
      return {
        customer,
        orders: s.orders,
        revenue: s.revenue,
        profit: s.profit,
        aov: ratio(s.revenue, s.orders),
        profitPerOrder: s.orders > 0 ? roundMinor(s.profit / s.orders) : 0,
        ltv: s.profit,
        repeatRatePct: repeatRate,
        returnRatePct: returnRate,
        lastOrderDate: s.last,
        daysSinceLastOrder: daysSince,
        segment,
        source: customer.source,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  return rows;
}

function segmentCustomer(input: {
  orders: number;
  profit: Money;
  daysSince: number | null;
  returnRate: number | null;
  newSinceDays: number;
}): CustomerSegment {
  if (input.returnRate !== null && input.returnRate > 40) return 'high-return';
  if (input.daysSince !== null && input.daysSince > 120 && input.orders > 1) return 'win-back';
  if (input.daysSince !== null && input.daysSince > 60 && input.orders > 1) return 'at-risk';
  if (input.newSinceDays <= 30 && input.orders <= 1) return 'new';
  if (input.orders >= 5 && input.profit > 0) return 'vip';
  if (input.orders >= 2) return 'repeat';
  return 'one-time';
}

/* ------------------------------------------------------------------ *
 * Couriers (spec §38 / §77)
 * ------------------------------------------------------------------ */

export interface CourierRow {
  courier: Courier;
  orders: number;
  delivered: number;
  failed: number;
  returned: number;
  /** return fees + refunds handed back through this courier */
  returnCost: Money;
  deliverySuccessPct: number | null;
  returnRatePct: number | null;
  totalFees: Money;
  feePerDelivered: Money;
  failedDeliveryCost: Money;
  codOutstanding: Money;
  settlementLagDays: number;
  netContribution: Money;
  revenue: Money;
}

export function computeCourierAnalytics(data: WorkspaceData, range: DateRange): CourierRow[] {
  const period = selectPeriod(data, range);
  const costs = unitCostMap(data);
  const returnCostByOrder = returnCashCostByOrder(period.returns, (id) => costs.get(id) ?? 0);

  const rows = new Map<string, CourierRow>();
  const ensure = (courier: Courier): CourierRow => {
    let row = rows.get(courier.id);
    if (!row) {
      row = {
        courier,
        orders: 0,
        delivered: 0,
        failed: 0,
        returned: 0,
        returnCost: 0,
        deliverySuccessPct: null,
        returnRatePct: null,
        totalFees: 0,
        feePerDelivered: 0,
        failedDeliveryCost: 0,
        codOutstanding: 0,
        settlementLagDays: courier.settlementDays,
        netContribution: 0,
        revenue: 0,
      };
      rows.set(courier.id, row);
    }
    return row;
  };

  const paidByOrder = new Map<string, Money>();
  for (const p of data.payments) {
    const signed = p.type === 'in' ? p.amount : -p.amount;
    paidByOrder.set(p.orderId, add(paidByOrder.get(p.orderId) ?? 0, signed));
  }

  for (const order of period.orders) {
    if (!order.courierId) continue;
    const courier = data.couriers.find((c) => c.id === order.courierId);
    if (!courier) continue;
    const row = ensure(courier);
    row.orders += 1;
    const fees = add(order.deliveryFee ?? 0, order.codFee ?? 0);
    row.totalFees = add(row.totalFees, fees);
    if (order.status === 'delivered') {
      row.delivered += 1;
      const due = sub(
        sum(
          period.orderItems
            .filter((i) => i.orderId === order.id)
            .map((i) => roundMinor(i.unitPrice * i.qty)),
        ),
        paidByOrder.get(order.id) ?? 0,
      );
      if (due > 0) row.codOutstanding = add(row.codOutstanding, due);
    } else if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'returned') {
      row.failed += 1;
      row.failedDeliveryCost = add(row.failedDeliveryCost, fees);
    }
    if (order.status === 'returned') row.returned += 1;
    row.revenue = add(
      row.revenue,
      sum(period.orderItems.filter((i) => i.orderId === order.id).map((i) => roundMinor(i.unitPrice * i.qty))),
    );
  }

  for (const r of period.returns) {
    const order = data.orders.find((o) => o.id === r.orderId);
    if (!order?.courierId) continue;
    const courier = data.couriers.find((c) => c.id === order.courierId);
    if (!courier) continue;
    const row = ensure(courier);
    row.returned += 1;
    row.returnCost = add(row.returnCost, returnCostByOrder.get(r.orderId) ?? 0);
  }

  for (const row of rows.values()) {
    const closed = row.delivered + row.failed;
    row.deliverySuccessPct = closed > 0 ? (row.delivered / closed) * 100 : null;
    row.returnRatePct = closed > 0 ? (row.returned / closed) * 100 : null;
    row.feePerDelivered = row.delivered > 0 ? roundMinor(row.totalFees / row.delivered) : 0;
    // Net contribution = revenue delivered − courier fees − failed delivery cost
    // − return cost handled by this courier. Ranked by contribution, not by
    // headline success rate (spec §38 / §77).
    row.netContribution = sub(row.revenue, row.totalFees, row.failedDeliveryCost, row.returnCost);
  }

  return [...rows.values()].sort((a, b) => b.netContribution - a.netContribution);
}

/* ------------------------------------------------------------------ *
 * Suppliers (spec §76)
 * ------------------------------------------------------------------ */

export interface SupplierRow {
  supplier: Supplier;
  purchaseSpend: Money;
  orders: number;
  products: number;
  averageUnitCost: number | null;
  costTrendPct: number | null;
  leadTimeDays: number | null;
  onTimeRatePct: number | null;
  outstanding: Money;
  qualitySignal: number | null;
  sharePct: number | null;
  flags: string[];
}

export function computeSupplierAnalytics(data: WorkspaceData, range: DateRange): SupplierRow[] {
  const purchases = data.purchases.filter((p) => p.status !== 'cancelled');
  const totalSpend = sum(
    purchases.flatMap((p) =>
      data.purchaseItems.filter((i) => i.purchaseId === p.id).map((i) => roundMinor(i.buyingPrice * i.receivedQty)),
    ),
  );

  const returnDamageByProduct = new Map<string, number>();
  for (const r of data.returns) {
    if (r.condition === 'damaged' || !r.resellable) {
      returnDamageByProduct.set(r.productId, (returnDamageByProduct.get(r.productId) ?? 0) + r.qty);
    }
  }
  for (const d of data.damages) {
    returnDamageByProduct.set(d.productId, (returnDamageByProduct.get(d.productId) ?? 0) + d.qty);
  }

  const soldByProduct = new Map<string, number>();
  for (const i of data.orderItems) soldByProduct.set(i.productId, (soldByProduct.get(i.productId) ?? 0) + i.qty);

  return data.suppliers
    .map((supplier) => {
      const own = purchases.filter((p) => p.supplierId === supplier.id);
      const items = own.flatMap((p) => data.purchaseItems.filter((i) => i.purchaseId === p.id));
      const spend = sum(items.map((i) => roundMinor(i.buyingPrice * i.receivedQty)));
      const receivedQty = sum(items.map((i) => i.receivedQty));
      const outstanding = sum(own.map((p) => purchaseEconomics(p, data.purchaseItems).outstanding));

      const leadTimes = own
        .filter((p) => p.receivedDate && p.expectedDate)
        .map((p) => daysBetweenISO(p.expectedDate!, p.receivedDate!));
      const onTime = own.filter((p) => p.receivedDate && p.expectedDate);
      const onTimeCount = onTime.filter((p) => p.receivedDate! <= p.expectedDate!).length;

      const firstHalf = own.filter((p) => p.date < range.start);
      const secondHalf = own.filter((p) => inRange(p.date, range));
      const avg = (list: Purchase[]) => {
        const its = list.flatMap((p) => data.purchaseItems.filter((i) => i.purchaseId === p.id));
        const qty = sum(its.map((i) => i.receivedQty));
        const cost = sum(its.map((i) => roundMinor(i.buyingPrice * i.receivedQty)));
        return qty > 0 ? cost / qty : null;
      };
      const a = avg(firstHalf);
      const b = avg(secondHalf);
      const costTrend = a !== null && b !== null && a > 0 ? ((b - a) / a) * 100 : null;

      const productIds = [...new Set(items.map((i) => i.productId))];
      const badUnits = sum(productIds.map((id) => returnDamageByProduct.get(id) ?? 0));
      const soldUnits = sum(productIds.map((id) => soldByProduct.get(id) ?? 0));
      const quality = soldUnits + badUnits > 0 ? (badUnits / (soldUnits + badUnits)) * 100 : null;

      const flags: string[] = [];
      if (receivedQty === 0) flags.push('idle');
      if (outstanding > 0) flags.push('payable');
      if (costTrend !== null && costTrend > 8) flags.push('expensive');
      if (leadTimes.length > 0 && leadTimes.reduce((x, y) => x + y, 0) / leadTimes.length > 7) flags.push('slow');
      if (onTime.length >= 3 && onTimeCount / onTime.length > 0.8) flags.push('reliable');
      if (quality !== null && quality > 10) flags.push('quality-risk');
      if (items.length === 0) flags.push('thin-data');

      return {
        supplier,
        purchaseSpend: spend,
        orders: own.length,
        products: productIds.length,
        averageUnitCost: receivedQty > 0 ? spend / receivedQty : null,
        costTrendPct: costTrend,
        leadTimeDays: leadTimes.length ? leadTimes.reduce((x, y) => x + y, 0) / leadTimes.length : null,
        onTimeRatePct: onTime.length ? (onTimeCount / onTime.length) * 100 : null,
        outstanding,
        qualitySignal: quality,
        sharePct: totalSpend > 0 ? (spend / totalSpend) * 100 : null,
        flags,
      } satisfies SupplierRow;
    })
    .sort((a, b) => b.purchaseSpend - a.purchaseSpend);
}

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

export interface TrendPoint {
  date: string;
  revenue: Money;
  netRevenue: Money;
  cogs: Money;
  grossProfit: Money;
  contributionProfit: Money;
  netProfit: Money;
  adSpend: Money;
  expenses: Money;
  orders: number;
  units: number;
  cash: Money;
  inventoryValue: Money;
  marginPct: number | null;
}

export function computeDailyTrend(data: WorkspaceData, range: DateRange, settings: Settings): TrendPoint[] {
  const costs = unitCostMap(data);
  const unitCostOf = (id: string) => costs.get(id) ?? 0;
  const products = productMap(data);
  const couriers = new Map(data.couriers.map((c) => [c.id, c]));
  const days = eachDay(range.start, range.end);
  const returnCostByOrder = returnCashCostByOrder(
    data.returns.filter((r) => inRange(r.date, range)),
    unitCostOf,
  );

  let cash = cashAt(data, addOneDay(range.start), settings.openingCash);

  return days.map((date) => {
    const orders = data.orders.filter((o) => o.date === date);
    const orderIds = new Set(orders.map((o) => o.id));
    const items = data.orderItems.filter((i) => orderIds.has(i.orderId));
    const expenses = sum(data.expenses.filter((e) => e.date === date).map((e) => e.amount));
    const adRows = data.adRows.filter((r) => r.date === date);
    const payments = data.payments.filter((p) => p.date === date);
    const purchasePayments = sum(
      data.purchases.flatMap((p) => p.payments.filter((pp) => pp.date === date).map((pp) => pp.amount)),
    );

    const pl = profitAndLoss({
      orders,
      orderItems: items,
      returns: data.returns.filter((r) => r.date === date),
      damages: data.damages.filter((d) => d.date === date),
      expenses: data.expenses.filter((e) => e.date === date),
      adRows,
      unitCostOf,
    });

    const contributions = orders.map((order) =>
      orderEconomics(order, items, { productById: products, courierById: couriers, returnCostByOrder }),
    );
    const contributionProfit = sum(contributions.map((c) => c.contributionProfit));

    cash = add(
      cash,
      sum(payments.filter((p) => p.type === 'in').map((p) => p.amount)),
      -sum(payments.filter((p) => p.type !== 'in').map((p) => p.amount)),
      -expenses,
      -purchasePayments,
    );

    const inventoryValue = sum(
      data.products.map((p) => {
        const moves = data.movements.filter((m) => m.productId === p.id && m.date <= date);
        return stockFromMovements(p.id, moves, costs.get(p.id) ?? 0).inventoryValue;
      }),
    );

    return {
      date,
      revenue: pl.grossRevenue,
      netRevenue: pl.netRevenue,
      cogs: pl.cogs,
      grossProfit: pl.grossProfit,
      contributionProfit,
      netProfit: sub(contributionProfit, pl.operatingExpenses),
      adSpend: sum(adRows.map((r) => r.spend ?? 0)),
      expenses,
      orders: orders.length,
      units: pl.units,
      cash,
      inventoryValue,
      marginPct: ratio(sub(contributionProfit, pl.operatingExpenses) * 100, pl.netRevenue),
    };
  });
}

/** Monthly aggregation used by long-range charts. */
export function computeMonthlyTrend(data: WorkspaceData, months: string[], settings: Settings): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const m of months) {
    const start = `${m}-01`;
    const end = endOfMonthISO(m);
    const days = daysBetweenISO(start, end) + 1;
    const range: DateRange = {
      start,
      end,
      days,
      prev: { start: addDaysISO(start, -days), end: addDaysISO(start, -1) },
    };
    const period = selectPeriod(data, range);
    const metrics = computePeriodMetrics({ data, period, range, settings });
    out.push({
      date: m,
      revenue: metrics.pl.grossRevenue,
      netRevenue: metrics.pl.netRevenue,
      cogs: metrics.pl.cogs,
      grossProfit: metrics.pl.grossProfit,
      contributionProfit: metrics.pl.contributionProfit,
      netProfit: metrics.pl.netOperatingProfit,
      adSpend: metrics.ad.spend,
      expenses: metrics.pl.operatingExpenses,
      orders: metrics.pl.orders,
      units: metrics.pl.units,
      cash: metrics.cash.closingCash,
      inventoryValue: computeInventoryValue(data),
      marginPct: metrics.pl.netMarginPct,
    });
  }
  return out;
}

function addDaysISO(iso: string, delta: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** Group trend points into months for display. */
export function toMonthly(points: TrendPoint[]): { month: string; points: TrendPoint[] }[] {
  const map = new Map<string, TrendPoint[]>();
  for (const p of points) {
    const key = monthKey(p.date);
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return [...map.entries()].map(([month, pts]) => ({ month, points: pts }));
}

/* ------------------------------------------------------------------ *
 * Expense intelligence (spec §71)
 * ------------------------------------------------------------------ */

export interface ExpenseInsight {
  category: string;
  current: Money;
  previous: Money;
  change: Money;
  changePct: number | null;
  shareOfRevenuePct: number | null;
  unusual: boolean;
}

export function computeExpenseInsights(
  data: WorkspaceData,
  range: DateRange,
  netRevenue: Money,
  minRelative = 0.1,
  minAbsolute: Money = 50000,
): ExpenseInsight[] {
  const current = data.expenses.filter((e) => inRange(e.date, range));
  const previous = data.expenses.filter((e) => inRange(e.date, range.prev));

  const group = (rows: Expense[]) => {
    const map = new Map<string, Money>();
    for (const e of rows) map.set(e.category, add(map.get(e.category) ?? 0, e.amount));
    return map;
  };
  const cur = group(current);
  const prev = group(previous);
  const categories = new Set([...cur.keys(), ...prev.keys()]);

  return [...categories]
    .map((category) => {
      const c = cur.get(category) ?? 0;
      const p = prev.get(category) ?? 0;
      const change = sub(c, p);
      const changePct = p > 0 ? (change / p) * 100 : null;
      const unusual =
        Math.abs(change) >= minAbsolute && (changePct === null ? c > 0 : Math.abs(changePct / 100) >= minRelative);
      return {
        category,
        current: c,
        previous: p,
        change,
        changePct,
        shareOfRevenuePct: ratio(c * 100, netRevenue),
        unusual,
      };
    })
    .sort((a, b) => b.current - a.current);
}

/* ------------------------------------------------------------------ *
 * Renewals (spec §115)
 * ------------------------------------------------------------------ */

export interface RenewalRow {
  item: RecurringExpense;
  daysUntilDue: number;
  bucket: 'overdue' | 'today' | '7' | '30' | '90' | 'later';
}

export function computeRenewals(recurring: readonly RecurringExpense[], today: string): RenewalRow[] {
  return recurring
    .filter((r) => r.active)
    .map((item) => {
      const days = daysBetweenISO(today, item.nextDue);
      const bucket: RenewalRow['bucket'] =
        days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? '7' : days <= 30 ? '30' : days <= 90 ? '90' : 'later';
      return { item, daysUntilDue: days, bucket };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/** Advance a recurring definition's next-due date after a payment is recorded. */
export function nextDueDate(item: RecurringExpense, from: string): string {
  const d = new Date(Date.parse(`${from}T00:00:00Z`));
  if (item.cycle === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (item.cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCDate(d.getUTCDate() + (item.intervalDays > 0 ? item.intervalDays : 30));
  return d.toISOString().slice(0, 10);
}

