/**
 * Database access layer.
 * - single Dexie instance
 * - workspace bootstrap (business + settings always exist)
 * - backup / restore with schema versioning
 * - scoped reset with automatic backup, orphan pruning and recalculation
 * - audit trail
 */
import { uid } from '../lib/id';
import { APP_VERSION, defaultSettings, DEFAULT_BUSINESS } from '../domain/defaults';
import { buildLedger } from '../domain/finance';
import {
  DATA_TABLES,
  RESET_SCOPES,
  SCHEMA_VERSION,
  SellerOSDB,
  type DataTable,
  type ResetScope,
} from './schema';
import type {
  AdRow,
  AuditEntry,
  Business,
  Courier,
  Customer,
  Damage,
  Expense,
  Goal,
  InventoryMovement,
  ManualLedgerEntry,
  NotificationState,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  RecurringExpense,
  ReturnRecord,
  Settings,
  Supplier,
} from '../domain/types';

export const db = new SellerOSDB();

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

let bootstrapped: Promise<void> | null = null;

/** Make sure the workspace always exists. The workspace itself is never deleted. */
export function ensureWorkspace(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await db.open();
      const [business, settings] = await Promise.all([
        db.business.get('current'),
        db.settings.get('current'),
      ]);
      if (!business) await db.business.put({ ...DEFAULT_BUSINESS, createdAt: new Date().toISOString() });
      if (!settings) await db.settings.put(defaultSettings());
    })();
  }
  return bootstrapped;
}

/** Test/dev helper: drop everything and re-bootstrap. */
export async function destroyWorkspace(): Promise<void> {
  await db.delete();
  bootstrapped = null;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export interface WorkspaceData {
  business: Business;
  settings: Settings;
  products: Product[];
  movements: InventoryMovement[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  suppliers: Supplier[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
  couriers: Courier[];
  returns: ReturnRecord[];
  damages: Damage[];
  expenses: Expense[];
  recurring: RecurringExpense[];
  manualLedger: ManualLedgerEntry[];
  ledger: ReturnType<typeof buildLedger>;
  adRows: AdRow[];
  goals: Goal[];
  notificationStates: NotificationState[];
}

/**
 * Load the whole workspace once. SellerOS is local-first and the dataset is
 * small enough to hold in memory, which keeps every derived metric a pure
 * function of this object (and therefore testable without a browser).
 */
export async function loadWorkspace(): Promise<WorkspaceData> {
  await ensureWorkspace();
  const [
    business,
    settings,
    products,
    movements,
    purchases,
    purchaseItems,
    suppliers,
    customers,
    orders,
    orderItems,
    payments,
    couriers,
    returns,
    damages,
    expenses,
    recurring,
    manualLedger,
    adRows,
    goals,
    notificationStates,
  ] = await Promise.all([
    db.business.get('current') as Promise<Business>,
    db.settings.get('current') as Promise<Settings>,
    db.products.toArray(),
    db.inventoryMovements.toArray(),
    db.purchases.toArray(),
    db.purchaseItems.toArray(),
    db.suppliers.toArray(),
    db.customers.toArray(),
    db.orders.toArray(),
    db.orderItems.toArray(),
    db.payments.toArray(),
    db.couriers.toArray(),
    db.returns.toArray(),
    db.damages.toArray(),
    db.expenses.toArray(),
    db.recurringExpenses.toArray(),
    db.manualLedger.toArray(),
    db.adRows.toArray(),
    db.goals.toArray(),
    db.notificationStates.toArray(),
  ]);

  return {
    business,
    settings,
    products,
    movements,
    purchases,
    purchaseItems,
    suppliers,
    customers,
    orders,
    orderItems,
    payments,
    couriers,
    returns,
    damages,
    expenses,
    recurring,
    manualLedger,
    adRows,
    goals,
    notificationStates,
    ledger: [],
  };
}

/* ------------------------------------------------------------------ *
 * Ledger projection
 * ------------------------------------------------------------------ */

/**
 * Rebuild the cash ledger from source records.
 * Because the projection is always derived, orphan ledger rows are impossible
 * and a scoped reset cannot leave money behind.
 */
export async function rebuildLedger(): Promise<number> {
  const [payments, purchases, expenses, manual] = await Promise.all([
    db.payments.toArray(),
    db.purchases.toArray(),
    db.expenses.toArray(),
    db.manualLedger.toArray(),
  ]);
  const purchasePayments = purchases.flatMap((p) =>
    p.payments.map((pp) => ({
      date: pp.date,
      amount: pp.amount,
      label: `${p.ref || 'Purchase'} — ${pp.method}`,
      refId: p.id,
    })),
  );
  const entries = buildLedger({ payments, purchasePayments, expenses, manual });
  await db.transaction('rw', db.ledger, async () => {
    await db.ledger.clear();
    await db.ledger.bulkPut(entries);
  });
  return entries.length;
}

/* ------------------------------------------------------------------ *
 * Orphan pruning — runs after every destructive operation
 * ------------------------------------------------------------------ */

export interface PruneReport {
  removed: { table: string; count: number }[];
}

export async function pruneOrphans(): Promise<PruneReport> {
  const report: PruneReport = { removed: [] };

  const track = (table: string, count: number) => {
    if (count > 0) report.removed.push({ table, count });
  };

  await db.transaction(
    'rw',
    [
      db.orderItems,
      db.payments,
      db.returns,
      db.damages,
      db.purchaseItems,
      db.inventoryMovements,
      db.expenses,
      db.orders,
      db.products,
      db.purchases,
    ],
    async () => {
      const orders = await db.orders.toArray();
      const products = await db.products.toArray();
      const purchases = await db.purchases.toArray();
      const orderIds = new Set(orders.map((o) => o.id));
      const productIds = new Set(products.map((p) => p.id));
      const purchaseIds = new Set(purchases.map((p) => p.id));

      const orphanOrderItems = await db.orderItems
        .filter((i) => !orderIds.has(i.orderId))
        .primaryKeys();
      await db.orderItems.bulkDelete(orphanOrderItems);
      track('orderItems', orphanOrderItems.length);

      const orphanPayments = await db.payments.filter((p) => !orderIds.has(p.orderId)).primaryKeys();
      await db.payments.bulkDelete(orphanPayments);
      track('payments', orphanPayments.length);

      const orphanReturns = await db.returns.filter((r) => !orderIds.has(r.orderId)).primaryKeys();
      await db.returns.bulkDelete(orphanReturns);
      track('returns', orphanReturns.length);

      const orphanDamages = await db.damages
        .filter((d) => !productIds.has(d.productId))
        .primaryKeys();
      await db.damages.bulkDelete(orphanDamages);
      track('damages', orphanDamages.length);

      const orphanPurchaseItems = await db.purchaseItems
        .filter((i) => !purchaseIds.has(i.purchaseId) || !productIds.has(i.productId))
        .primaryKeys();
      await db.purchaseItems.bulkDelete(orphanPurchaseItems);
      track('purchaseItems', orphanPurchaseItems.length);

      const orphanMovements = await db.inventoryMovements
        .filter((m) => !productIds.has(m.productId))
        .primaryKeys();
      await db.inventoryMovements.bulkDelete(orphanMovements);
      track('inventoryMovements', orphanMovements.length);

      // expenses referencing a removed recurring definition keep the expense
      // (it was really paid) but lose the link
      const recurring = await db.recurringExpenses.toArray();
      const recurringIds = new Set(recurring.map((r) => r.id));
      const dangling = await db.expenses.filter(
        (e) => e.recurringId !== null && !recurringIds.has(e.recurringId),
      ).toArray();
      for (const e of dangling) await db.expenses.update(e.id, { recurringId: null });
      track('expenses.recurringId', dangling.length);
    },
  );

  await rebuildLedger();
  return report;
}

/* ------------------------------------------------------------------ *
 * Scoped reset (spec §9)
 * ------------------------------------------------------------------ */

export async function countScope(scope: ResetScope): Promise<number> {
  const tables = RESET_SCOPES[scope].tables;
  let total = 0;
  for (const t of tables) total += await (db.table(t) as unknown as { count(): Promise<number> }).count();
  return total;
}

export interface ResetResult {
  cleared: { table: DataTable; count: number }[];
  preserved: string[];
  ledgerRebuilt: number;
  pruned: PruneReport;
  backup: BackupFile;
}

/**
 * Clear one business area.
 * Always: count first, back up automatically, clear, prune orphans, rebuild
 * derived projections. The workspace (business profile + settings) is never
 * touched, so a reset can never delete the business itself.
 */
export async function resetScope(scope: ResetScope): Promise<ResetResult> {
  const backup = await backupWorkspace(`pre-reset-${scope}`);
  const config = RESET_SCOPES[scope];
  const cleared: { table: DataTable; count: number }[] = [];

  await db.transaction(
    'rw',
    config.tables.map((t) => db.table(t)),
    async () => {
      for (const t of config.tables) {
        const table = db.table(t) as unknown as { clear(): Promise<void>; count(): Promise<number> };
        const count = await table.count();
        await table.clear();
        cleared.push({ table: t, count });
      }
    },
  );

  // Products are gone → their movements are meaningless.
  if (scope === 'products') {
    await db.inventoryMovements.clear();
    cleared.push({ table: 'inventoryMovements', count: -1 });
  }

  const pruned = await pruneOrphans();
  const ledgerRebuilt = await rebuildLedger();

  return {
    cleared,
    preserved: ['business', 'settings'],
    ledgerRebuilt,
    pruned,
    backup,
  };
}

/** Clear every piece of business data but keep the workspace profile. */
export async function clearAllData(): Promise<{ backup: BackupFile }> {
  const backup = await backupWorkspace('pre-clear-all');
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) await db.table(t).clear();
  });
  await pruneOrphans();
  await rebuildLedger();
  return { backup };
}

/* ------------------------------------------------------------------ *
 * Backup & restore (spec §6 / §135)
 * ------------------------------------------------------------------ */

export interface BackupFile {
  app: 'SellerOS';
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  label: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

const BACKUP_TABLES = [
  'business',
  'settings',
  'products',
  'inventoryMovements',
  'purchases',
  'purchaseItems',
  'suppliers',
  'customers',
  'orders',
  'orderItems',
  'payments',
  'couriers',
  'returns',
  'damages',
  'expenses',
  'recurringExpenses',
  'manualLedger',
  'adRows',
  'goals',
  'audit',
  'notificationStates',
] as const;

export async function backupWorkspace(label = 'manual'): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows = await db.table(t).toArray();
    data[t] = rows;
    counts[t] = rows.length;
  }
  return {
    app: 'SellerOS',
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    label,
    counts,
    data,
  };
}

export interface RestoreReport {
  restored: { table: string; count: number }[];
  skipped: string[];
}

export function isBackupFile(value: unknown): value is BackupFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as BackupFile).app === 'SellerOS' &&
    typeof (value as BackupFile).data === 'object'
  );
}

/**
 * Restore a backup. Unknown tables are skipped (forward compatible) and known
 * tables are replaced wholesale so a restore is never a partial merge.
 */
export async function restoreWorkspace(payload: BackupFile): Promise<RestoreReport> {
  const restored: RestoreReport['restored'] = [];
  const skipped: string[] = [];

  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = payload.data[t];
      if (!Array.isArray(rows)) {
        skipped.push(t);
        continue;
      }
      await db.table(t).clear();
      if (rows.length > 0) await db.table(t).bulkPut(rows as never[]);
      restored.push({ table: t, count: rows.length });
    }
    for (const key of Object.keys(payload.data)) {
      if (!(BACKUP_TABLES as readonly string[]).includes(key)) skipped.push(key);
    }
  });

  await pruneOrphans();
  await rebuildLedger();
  return { restored, skipped };
}

/* ------------------------------------------------------------------ *
 * Audit trail (spec §85)
 * ------------------------------------------------------------------ */

export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

export function diffRecords(before: Record<string, unknown> | null, after: Record<string, unknown>): AuditChange[] {
  const out: AuditChange[] = [];
  if (!before) return out;
  for (const key of Object.keys(after)) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    const b = JSON.stringify(before[key] ?? null);
    const a = JSON.stringify(after[key] ?? null);
    if (b !== a) out.push({ field: key, before: before[key], after: after[key] });
  }
  return out;
}

export async function logAudit(
  entity: string,
  entityId: string,
  label: string,
  changes: AuditChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const entries: AuditEntry[] = changes.map((c) => ({
    id: uid('aud'),
    at: new Date().toISOString(),
    entity,
    entityId,
    label,
    field: c.field,
    before: String(c.before ?? ''),
    after: String(c.after ?? ''),
  }));
  await db.audit.bulkAdd(entries);
}

/* ------------------------------------------------------------------ *
 * Convenience mutators that keep projections consistent
 * ------------------------------------------------------------------ */

/** Opening stock → an `opening` inventory movement (spec §24). */
export async function syncOpeningStock(productId: string, qty: number, unitCost: number): Promise<void> {
  const existing = await db.inventoryMovements
    .where('productId')
    .equals(productId)
    .filter((m) => m.type === 'opening')
    .toArray();
  if (existing.length === 0) {
    if (qty !== 0) {
      await db.inventoryMovements.add({
        id: uid('mov'),
        productId,
        type: 'opening',
        qty,
        date: new Date().toISOString().slice(0, 10),
        unitCost,
        refType: 'product',
        refId: productId,
        note: 'Opening stock',
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }
  const current = existing[0];
  if (current.qty === qty) return;
  await db.inventoryMovements.put({ ...current, qty });
}

export { SellerOSDB, SCHEMA_VERSION, DATA_TABLES, RESET_SCOPES };
export type { ResetScope, DataTable };
