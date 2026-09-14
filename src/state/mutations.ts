/**
 * Mutations — the only place records are written.
 * Every create/update/delete keeps derived data consistent: opening stock
 * becomes a movement, sales decrement stock, purchases increment it, and every
 * meaningful field change lands in the audit trail.
 */
import { db, logAudit, diffRecords, syncOpeningStock } from '../db';
import { uid } from '../lib/id';
import { roundMinor, sum, type Money } from '../lib/money';
import { EMPTY_DIRECT_COSTS, trueUnitCost } from '../domain/finance';
import type {
  AdRow,
  Courier,
  Customer,
  Damage,
  Expense,
  Goal,
  InventoryMovement,
  ManualLedgerEntry,
  MovementType,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  RecurringExpense,
  ReturnRecord,
  Supplier,
} from '../domain/types';

const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export function emptyProduct(): Product {
  return {
    id: uid('prd'),
    sku: '',
    barcode: '',
    name: '',
    category: '',
    brand: '',
    supplierId: null,
    description: '',
    tags: [],
    status: 'active',
    image: null,
    notes: '',
    sellingPrice: 0,
    buyingPrice: 0,
    compareAtPrice: 0,
    discountPct: 0,
    minSellingPrice: 0,
    targetMarginPct: 30,
    targetProfit: 0,
    reorderLevel: 10,
    reorderQuantity: 25,
    safetyStock: 5,
    weightKg: 0,
    packageWeightKg: 0,
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    costs: { ...EMPTY_DIRECT_COSTS },
    costBasis: 'perUnit',
    batchQty: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export interface ProductValidation {
  name?: string;
  sku?: string;
  sellingPrice?: string;
  buyingPrice?: string;
}

export function validateProduct(product: Product, existing: Product[], errors: Record<string, string>): ProductValidation {
  const out: ProductValidation = {};
  if (!product.name.trim()) out.name = errors.required;
  if (!product.sku.trim()) out.sku = errors.required;
  else if (existing.some((p) => p.id !== product.id && p.sku.toLowerCase() === product.sku.trim().toLowerCase()))
    out.sku = errors.duplicateSku;
  if (product.sellingPrice < 0) out.sellingPrice = errors.negative;
  if (product.buyingPrice < 0) out.buyingPrice = errors.negative;
  return out;
}

/**
 * Save a product.
 * Opening stock is mirrored into an `opening` inventory movement so that
 * "Opening stock = 25" immediately means current stock = 25 (spec §24) and the
 * product is never shown as out of stock by mistake.
 */
export async function saveProduct(product: Product, openingStock: number | null): Promise<void> {
  const existing = await db.products.get(product.id);
  await db.products.put({ ...product, updatedAt: nowISO() });
  await logAudit('product', product.id, product.name, diffRecords((existing as never) ?? null, product as never));
  if (openingStock !== null) {
    await syncOpeningStock(product.id, openingStock, trueUnitCost(product));
  }
}

export async function deleteProduct(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.inventoryMovements, db.orderItems, db.purchaseItems, db.damages],
    async () => {
      await db.products.delete(id);
      await db.inventoryMovements.where('productId').equals(id).delete();
      await db.orderItems.where('productId').equals(id).delete();
      await db.purchaseItems.where('productId').equals(id).delete();
      await db.damages.where('productId').equals(id).delete();
    },
  );
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export async function addMovement(movement: Omit<InventoryMovement, 'id' | 'createdAt'>): Promise<void> {
  await db.inventoryMovements.add({ ...movement, id: uid('mov'), createdAt: nowISO() });
  await logAudit('inventory', movement.productId, movement.note || movement.type, [
    { field: 'qty', before: '', after: movement.qty },
  ]);
}

export async function addMovements(movements: Omit<InventoryMovement, 'id' | 'createdAt'>[]): Promise<void> {
  await db.inventoryMovements.bulkAdd(
    movements.map((m) => ({ ...m, id: uid('mov'), createdAt: nowISO() })),
  );
}

/* ------------------------------------------------------------------ *
 * Suppliers / Customers / Couriers
 * ------------------------------------------------------------------ */

export function emptySupplier(): Supplier {
  return { id: uid('sup'), name: '', phone: '', email: '', address: '', notes: '', createdAt: nowISO() };
}
export async function saveSupplier(supplier: Supplier): Promise<void> {
  const existing = await db.suppliers.get(supplier.id);
  await db.suppliers.put(supplier);
  await logAudit('supplier', supplier.id, supplier.name, diffRecords((existing as never) ?? null, supplier as never));
}

export function emptyCustomer(): Customer {
  return {
    id: uid('cus'),
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    notes: '',
    source: '',
    tags: [],
    createdAt: todayISO(),
  };
}
export async function saveCustomer(customer: Customer): Promise<void> {
  const existing = await db.customers.get(customer.id);
  await db.customers.put(customer);
  await logAudit('customer', customer.id, customer.name, diffRecords((existing as never) ?? null, customer as never));
}

export function emptyCourier(): Courier {
  return {
    id: uid('cou'),
    name: '',
    deliveryFee: 6000,
    codFee: 1000,
    codFeePct: 1,
    settlementDays: 3,
    notes: '',
    active: true,
    createdAt: nowISO(),
  };
}
export async function saveCourier(courier: Courier): Promise<void> {
  const existing = await db.couriers.get(courier.id);
  await db.couriers.put(courier);
  await logAudit('courier', courier.id, courier.name, diffRecords((existing as never) ?? null, courier as never));
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export function emptyOrder(): Order {
  return {
    id: uid('ord'),
    orderNo: '',
    date: todayISO(),
    customerId: null,
    channel: 'Facebook',
    courierId: null,
    trackingId: '',
    notes: '',
    status: 'pending',
    paymentStatus: 'unpaid',
    discount: 0,
    shippingCharged: 0,
    deliveryFee: 0,
    codFee: 0,
    packagingCost: 0,
    paymentFee: 0,
    otherCost: 0,
    adSpend: 0,
    attribution: {
      platform: '',
      campaign: '',
      adset: '',
      ad: '',
      creative: '',
      productId: null,
      source: '',
      medium: '',
      campaignId: '',
      method: 'manual',
    },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export interface DraftLine {
  productId: string;
  qty: number;
  unitPrice: Money;
  discount: Money;
}

export interface SaveOrderInput {
  order: Order;
  lines: DraftLine[];
  /** payment collected at the time of ordering */
  payment?: { amount: Money; method: string; type: Payment['type'] };
}

export async function nextOrderNumber(): Promise<string> {
  const count = await db.orders.count();
  return `SO-${1000 + count + 1}`;
}

/**
 * Save an order.
 * Sale movements are rebuilt from the order's lines so editing an order can
 * never leave stock out of sync.
 */
export async function saveOrder(input: SaveOrderInput): Promise<void> {
  const { order, lines, payment } = input;
  const validLines = lines.filter((l) => l.productId && l.qty > 0);
  if (validLines.length === 0) throw new Error('An order needs at least one line.');

  const products = await db.products.bulkGet(validLines.map((l) => l.productId));
  const purchases = await db.purchases.toArray();
  const purchaseItems = await db.purchaseItems.toArray();
  const costMap = await landedCostMap(purchases, purchaseItems, products.filter(Boolean) as Product[]);

  const existing = await db.orders.get(order.id);
  const previousItems = existing ? await db.orderItems.where('orderId').equals(order.id).toArray() : [];

  await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.payments, db.inventoryMovements],
    async () => {
      await db.orders.put({ ...order, updatedAt: nowISO() });
      await db.orderItems.where('orderId').equals(order.id).delete();
      await db.orderItems.bulkAdd(
        validLines.map((l) => ({
          id: uid('oi'),
          orderId: order.id,
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          unitCost: costMap.get(l.productId) ?? 0,
        } satisfies OrderItem)),
      );

      // rebuild sale movements for this order only
      await db.inventoryMovements
        .where('refType')
        .equals('order')
        .filter((m) => m.refId === order.id)
        .delete();
      if (order.status !== 'cancelled') {
        await db.inventoryMovements.bulkAdd(
          validLines.map((l) => ({
            id: uid('mov'),
            productId: l.productId,
            type: 'sale' as MovementType,
            qty: -l.qty,
            date: order.date,
            unitCost: costMap.get(l.productId) ?? 0,
            refType: 'order',
            refId: order.id,
            note: order.orderNo,
            createdAt: nowISO(),
          })),
        );
      }

      if (payment && payment.amount > 0) {
        await db.payments.add({
          id: uid('pay'),
          orderId: order.id,
          date: order.date,
          method: payment.method,
          type: payment.type,
          amount: payment.amount,
          note: 'Recorded with order',
          createdAt: nowISO(),
        });
      }
    },
  );

  await logAudit('order', order.id, order.orderNo, [
    ...(diffRecords((existing as never) ?? null, order as never) as never[]),
    {
      field: 'lines',
      before: String(previousItems.length),
      after: String(validLines.length),
    },
  ]);
}

export async function deleteOrder(id: string): Promise<void> {
  await db.transaction('rw', [db.orders, db.orderItems, db.payments, db.inventoryMovements, db.returns], async () => {
    await db.orders.delete(id);
    await db.orderItems.where('orderId').equals(id).delete();
    await db.payments.where('orderId').equals(id).delete();
    await db.returns.where('orderId').equals(id).delete();
    await db.inventoryMovements
      .where('refType')
      .equals('order')
      .filter((m) => m.refId === id)
      .delete();
  });
}

export async function addPayment(payment: Omit<Payment, 'id' | 'createdAt'>): Promise<void> {
  await db.payments.add({ ...payment, id: uid('pay'), createdAt: nowISO() });
  await logAudit('payment', payment.orderId, payment.method, [{ field: 'amount', before: '', after: payment.amount }]);
}

/* ------------------------------------------------------------------ *
 * Purchasing
 * ------------------------------------------------------------------ */

export function emptyPurchase(): Purchase {
  return {
    id: uid('pur'),
    ref: '',
    supplierId: null,
    date: todayISO(),
    expectedDate: null,
    receivedDate: null,
    status: 'ordered',
    note: '',
    payments: [],
    additionalCosts: { ...EMPTY_DIRECT_COSTS },
    createdAt: nowISO(),
  };
}

export interface PurchaseLine {
  productId: string;
  qty: number;
  receivedQty: number;
  buyingPrice: Money;
}

export async function savePurchase(purchase: Purchase, lines: PurchaseLine[]): Promise<void> {
  const valid = lines.filter((l) => l.productId && l.qty > 0);
  const existing = await db.purchases.get(purchase.id);

  await db.transaction('rw', [db.purchases, db.purchaseItems, db.inventoryMovements], async () => {
    await db.purchases.put(purchase);
    await db.purchaseItems.where('purchaseId').equals(purchase.id).delete();
    await db.purchaseItems.bulkAdd(
      valid.map((l) => ({
        id: uid('pi'),
        purchaseId: purchase.id,
        productId: l.productId,
        qty: l.qty,
        receivedQty: l.receivedQty,
        buyingPrice: l.buyingPrice,
      } satisfies PurchaseItem)),
    );

    // rebuild purchase movements so partial receiving stays exact
    await db.inventoryMovements
      .where('refType')
      .equals('purchase')
      .filter((m) => m.refId === purchase.id)
      .delete();
    if (purchase.status !== 'cancelled' && purchase.status !== 'draft') {
      const received = valid.filter((l) => l.receivedQty > 0);
      if (received.length > 0) {
        await db.inventoryMovements.bulkAdd(
          received.map((l) => ({
            id: uid('mov'),
            productId: l.productId,
            type: 'purchase' as MovementType,
            qty: l.receivedQty,
            date: purchase.receivedDate ?? purchase.date,
            unitCost: l.buyingPrice,
            refType: 'purchase',
            refId: purchase.id,
            note: purchase.ref,
            createdAt: nowISO(),
          })),
        );
      }
    }
  });

  await logAudit('purchase', purchase.id, purchase.ref, diffRecords((existing as never) ?? null, purchase as never));
}

/* ------------------------------------------------------------------ *
 * Returns & damages
 * ------------------------------------------------------------------ */

export function emptyReturn(): ReturnRecord {
  return {
    id: uid('ret'),
    orderId: '',
    productId: '',
    qty: 1,
    date: todayISO(),
    reason: 'Customer refusal',
    courierId: null,
    returnFee: 0,
    refund: 0,
    packagingLoss: 0,
    adAllocation: 0,
    condition: 'resellable',
    resellable: true,
    note: '',
    createdAt: nowISO(),
  };
}

/**
 * Record a return.
 * Resellable stock returns to inventory; damaged/lost stock does not. Cash cost
 * and recovered stock stay separate in reporting (spec §40).
 */
export async function saveReturn(record: ReturnRecord, unitCost: Money): Promise<void> {
  const existing = await db.returns.get(record.id);
  await db.transaction('rw', [db.returns, db.inventoryMovements], async () => {
    await db.returns.put(record);
    await db.inventoryMovements
      .where('refType')
      .equals('return')
      .filter((m) => m.refId === record.id)
      .delete();
    if (record.resellable && record.qty > 0) {
      await db.inventoryMovements.add({
        id: uid('mov'),
        productId: record.productId,
        type: 'return',
        qty: record.qty,
        date: record.date,
        unitCost,
        refType: 'return',
        refId: record.id,
        note: record.reason,
        createdAt: nowISO(),
      });
    }
  });
  await logAudit('return', record.id, record.reason, diffRecords((existing as never) ?? null, record as never));
}

export function emptyDamage(): Damage {
  return {
    id: uid('dmg'),
    productId: '',
    qty: 1,
    date: todayISO(),
    reason: '',
    unitCost: 0,
    recoverable: false,
    recoveredAmount: 0,
    note: '',
    createdAt: nowISO(),
  };
}

export async function saveDamage(damage: Damage): Promise<void> {
  const existing = await db.damages.get(damage.id);
  await db.transaction('rw', [db.damages, db.inventoryMovements], async () => {
    await db.damages.put(damage);
    await db.inventoryMovements
      .where('refType')
      .equals('damage')
      .filter((m) => m.refId === damage.id)
      .delete();
    if (damage.qty > 0) {
      await db.inventoryMovements.add({
        id: uid('mov'),
        productId: damage.productId,
        type: 'damage',
        qty: -damage.qty,
        date: damage.date,
        unitCost: damage.unitCost,
        refType: 'damage',
        refId: damage.id,
        note: damage.reason,
        createdAt: nowISO(),
      });
    }
  });
  await logAudit('damage', damage.id, damage.reason, diffRecords((existing as never) ?? null, damage as never));
}

/* ------------------------------------------------------------------ *
 * Expenses
 * ------------------------------------------------------------------ */

export function emptyExpense(): Expense {
  return {
    id: uid('exp'),
    date: todayISO(),
    category: 'Other',
    amount: 0,
    vendor: '',
    note: '',
    method: '',
    recurringId: null,
    createdAt: nowISO(),
  };
}

export async function saveExpense(expense: Expense): Promise<void> {
  const existing = await db.expenses.get(expense.id);
  await db.expenses.put(expense);
  await logAudit('expense', expense.id, expense.category, diffRecords((existing as never) ?? null, expense as never));
}

export function emptyRecurring(): RecurringExpense {
  return {
    id: uid('rec'),
    name: '',
    category: 'Software',
    amount: 0,
    cycle: 'monthly',
    intervalDays: 30,
    nextDue: todayISO(),
    renewalType: '',
    note: '',
    active: true,
    createdAt: nowISO(),
  };
}

export async function saveRecurring(item: RecurringExpense): Promise<void> {
  await db.recurringExpenses.put(item);
}

/**
 * Record the ACTUAL payment of a recurring expense and roll the due date
 * forward. The recurring definition never books itself (spec §44).
 */
export async function payRecurring(item: RecurringExpense, dateISO: string, method: string): Promise<void> {
  await db.expenses.add({
    id: uid('exp'),
    date: dateISO,
    category: item.category,
    amount: item.amount,
    vendor: item.name,
    note: `${item.name} payment`,
    method,
    recurringId: item.id,
    createdAt: nowISO(),
  });
  const next = advanceDue(item, dateISO);
  await db.recurringExpenses.put({ ...item, nextDue: next });
}

export function advanceDue(item: RecurringExpense, from: string): string {
  const d = new Date(Date.parse(`${from}T00:00:00Z`));
  if (item.cycle === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (item.cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCDate(d.getUTCDate() + (item.intervalDays > 0 ? item.intervalDays : 30));
  return d.toISOString().slice(0, 10);
}

export async function addManualLedger(entry: Omit<ManualLedgerEntry, 'id' | 'createdAt'>): Promise<void> {
  await db.manualLedger.add({ ...entry, id: uid('led'), createdAt: nowISO() });
}

/* ------------------------------------------------------------------ *
 * Ads & goals
 * ------------------------------------------------------------------ */

export function emptyAdRow(): AdRow {
  return {
    id: uid('ad'),
    date: todayISO(),
    platform: 'meta',
    account: '',
    campaign: '',
    campaignType: '',
    campaignId: '',
    adset: '',
    ad: '',
    creative: '',
    creativeType: '',
    text: '',
    enhancement: '',
    placement: '',
    network: '',
    productId: null,
    sku: '',
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    destinationClicks: 0,
    landingViews: 0,
    addToCart: 0,
    initiateCheckout: 0,
    purchases: 0,
    conversions: 0,
    conversionValue: 0,
    revenue: 0,
    videoViews: 0,
    videoWatched25: 0,
    videoWatched50: 0,
    videoWatched75: 0,
    videoWatched100: 0,
    createdAt: nowISO(),
  };
}

export async function saveAdRows(rows: AdRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.adRows.bulkPut(rows);
}

export async function deleteAdRow(id: string): Promise<void> {
  await db.adRows.delete(id);
}

export function emptyGoal(): Goal {
  return {
    id: uid('goal'),
    metric: 'revenue',
    target: 0,
    period: 'monthly',
    note: '',
    active: true,
    createdAt: nowISO(),
  };
}

export async function saveGoal(goal: Goal): Promise<void> {
  await db.goals.put(goal);
}

/* ------------------------------------------------------------------ *
 * Cost helper shared with orders
 * ------------------------------------------------------------------ */

export async function landedCostMap(
  purchases: Purchase[],
  purchaseItems: PurchaseItem[],
  products: Product[],
): Promise<Map<string, Money>> {
  const { landedUnitCostByProduct } = await import('../domain/finance');
  const fromPurchases = landedUnitCostByProduct(purchases, purchaseItems);
  const out = new Map<string, Money>();
  for (const p of products) {
    out.set(p.id, trueUnitCost(p, fromPurchases.get(p.id) ?? null));
  }
  return out;
}

/** Total of a money field — used by forms for quick validation. */
export const totalLines = (lines: DraftLine[]): Money =>
  sum(lines.map((l) => roundMinor(l.unitPrice * l.qty) - l.discount));
